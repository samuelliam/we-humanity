#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  loadDotEnv,
  loadServiceAccount,
  getGoogleAccessToken,
  uploadBufferToFirebaseStorage,
  deleteFromFirebaseStorage,
} = require('./instagram-publisher');

const ROOT_DIR = path.resolve(__dirname, '..');
const RENDERS_DIR = path.join(ROOT_DIR, 'renders');
const TOKEN_PATH = path.join(ROOT_DIR, '.tiktok-token.json');
const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

const inFlightTikTok = new Set();

function readTikTokToken() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function saveTikTokToken(data) {
  const saved = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    open_id: data.open_id,
    scope: data.scope,
    expires_at: Date.now() + Math.max(60, Number(data.expires_in || 86400) - 120) * 1000,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(saved, null, 2), 'utf8');
  return saved;
}

const pendingPkce = new Map();

function generatePkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function getTikTokAuthUrl(redirectUri, state) {
  loadDotEnv();
  const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  if (!clientKey) throw new Error('Missing TIKTOK_CLIENT_KEY in .env');
  const { verifier, challenge } = generatePkcePair();
  pendingPkce.set(state, verifier);
  const params = new URLSearchParams({
    client_key: clientKey,
    scope: process.env.TIKTOK_SCOPES || 'user.info.basic,video.upload,video.publish',
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

async function exchangeTikTokCode(code, redirectUri, state) {
  loadDotEnv();
  const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
  if (!clientKey || !clientSecret) {
    throw new Error('Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET in .env');
  }

  const codeVerifier = state ? pendingPkce.get(state) : null;
  if (state) pendingPkce.delete(state);

  const formParams = {
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  };
  if (codeVerifier) {
    formParams.code_verifier = codeVerifier;
  }

  const res = await fetch(`${TIKTOK_API_BASE}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(formParams),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(`TikTok OAuth failed: ${data.error_description || data.error || res.status}`);
  }
  return saveTikTokToken(data);
}

async function getValidTikTokAccessToken() {
  loadDotEnv();
  const tok = readTikTokToken();
  if (!tok || !tok.access_token) {
    throw new Error('TikTok not connected. Click "Connect TikTok" in the Studio first.');
  }
  if (tok.expires_at && Date.now() < tok.expires_at) {
    return tok.access_token;
  }
  if (!tok.refresh_token) return tok.access_token;

  const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
  const res = await fetch(`${TIKTOK_API_BASE}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: tok.refresh_token,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`TikTok token refresh failed: ${data.error_description || data.error || res.status}`);
  }
  return saveTikTokToken(data).access_token;
}

function getSlideFiles(storyId) {
  if (!fs.existsSync(RENDERS_DIR)) return [];
  const prefix = `${storyId}_slide_`;
  return fs
    .readdirSync(RENDERS_DIR)
    .filter((f) => f.startsWith(prefix) && /\.(png|jpe?g)$/i.test(f))
    .map((f) => {
      const m = f.match(/_slide_(\d+)\.(png|jpe?g)$/i);
      return { filename: f, slideIndex: Number(m[1]), ext: m[2].toLowerCase() };
    })
    .sort((a, b) => a.slideIndex - b.slideIndex);
}

async function pollTikTokStatus(publishId, accessToken) {
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${TIKTOK_API_BASE}/post/publish/status/fetch/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const data = await res.json().catch(() => ({}));
    const status = data?.data?.status;
    if (status === 'PUBLISH_COMPLETE' || status === 'SEND_TO_USER_INBOX') {
      return status;
    }
    if (status === 'FAILED') {
      throw new Error(`TikTok publish failed: ${data?.data?.fail_reason || JSON.stringify(data)}`);
    }
  }
  return 'PROCESSING';
}

/**
 * Uploads rendered slides to Firebase Storage and pushes a Photo Carousel to TikTok
 * (defaults to MEDIA_UPLOAD / Inbox Drafts; set TIKTOK_POST_MODE=DIRECT_POST for direct publish).
 */
async function publishStoryToTikTok(rawStoryId, options = {}) {
  loadDotEnv();
  const storyId = String(rawStoryId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!storyId) throw new Error('Invalid storyId');

  const { force = false } = options;
  const metaPath = path.join(RENDERS_DIR, `${storyId}.meta.json`);
  let meta = {};
  if (fs.existsSync(metaPath)) {
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
  }

  if (!force && meta.tiktokPublished && meta.tiktokPublishId) {
    return {
      ok: true,
      alreadyPublished: true,
      storyId,
      publishId: meta.tiktokPublishId,
      status: meta.tiktokStatus || 'SENT',
      publishedAt: meta.tiktokPublishedAt || null,
    };
  }

  if (inFlightTikTok.has(storyId)) {
    return { ok: true, inProgress: true, storyId };
  }

  inFlightTikTok.add(storyId);
  try {
    const accessToken = await getValidTikTokAccessToken();
    const slides = getSlideFiles(storyId);
    if (slides.length < 2) {
      throw new Error(`TikTok carousels require at least 2 slides (found ${slides.length}).`);
    }

    const serviceAccount = loadServiceAccount();
    const bucket = process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.firebasestorage.app`;
    const googleToken = await getGoogleAccessToken(serviceAccount);

    const slideUrls = [];
    const uploadedPaths = [];
    for (const slide of slides) {
      const filePath = path.join(RENDERS_DIR, slide.filename);
      const buffer = fs.readFileSync(filePath);
      const contentType = slide.ext === 'png' ? 'image/png' : 'image/jpeg';
      const objectPath = `tiktok/${storyId}/${slide.filename}`;
      const publicUrl = await uploadBufferToFirebaseStorage({
        accessToken: googleToken,
        bucket,
        objectPath,
        contentType,
        buffer,
      });
      slideUrls.push(publicUrl);
      uploadedPaths.push(objectPath);
    }

    const postMode = (process.env.TIKTOK_POST_MODE || 'MEDIA_UPLOAD').toUpperCase();
    const title = String(meta.title || 'WE, HUMANITY').slice(0, 90);
    const description = String(meta.instagramCaption || meta.title || 'WE, HUMANITY').slice(0, 2200);

    const body = {
      post_info: {
        title,
        description,
        ...(postMode === 'DIRECT_POST'
          ? { privacy_level: process.env.TIKTOK_PRIVACY_LEVEL || 'SELF_ONLY', disable_comment: false, auto_add_music: true }
          : {}),
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_cover_index: 0,
        photo_images: slideUrls,
      },
      post_mode: postMode,
      media_type: 'PHOTO',
    };

    const initRes = await fetch(`${TIKTOK_API_BASE}/post/publish/content/init/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(body),
    });
    const initData = await initRes.json().catch(() => ({}));
    if (!initRes.ok || (initData.error && initData.error.code !== 'ok') || !initData.data?.publish_id) {
      throw new Error(`TikTok init failed: ${initData.error?.message || JSON.stringify(initData)}`);
    }

    const publishId = initData.data.publish_id;
    const finalStatus = await pollTikTokStatus(publishId, accessToken);

    await Promise.allSettled(
      uploadedPaths.map((objectPath) =>
        deleteFromFirebaseStorage({ accessToken: googleToken, bucket, objectPath })
      )
    );

    const publishedAt = new Date().toISOString();
    meta.tiktokPublished = true;
    meta.tiktokPublishId = publishId;
    meta.tiktokStatus = finalStatus;
    meta.tiktokPublishedAt = publishedAt;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    return {
      ok: true,
      alreadyPublished: false,
      storyId,
      publishId,
      status: finalStatus,
      postMode,
      publishedAt,
    };
  } finally {
    inFlightTikTok.delete(storyId);
  }
}

module.exports = {
  getTikTokAuthUrl,
  exchangeTikTokCode,
  readTikTokToken,
  publishStoryToTikTok,
};
