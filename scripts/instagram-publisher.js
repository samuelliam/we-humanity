#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const RENDERS_DIR = path.join(ROOT_DIR, 'renders');
const DEFAULT_IG_USER_ID = '17841414022297284';
const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

const inFlightPublishes = new Set();

/**
 * Loads KEY=VALUE pairs from `<ROOT_DIR>/.env` into `process.env` without overwriting existing env vars.
 */
function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = val;
    }
  }
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function loadServiceAccount() {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    return JSON.parse(inlineJson);
  }
  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(ROOT_DIR, 'firebase-service-account.json');
  const resolved = path.isAbsolute(configuredPath) ? configuredPath : path.resolve(ROOT_DIR, configuredPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Firebase service account JSON not found at ${resolved}. Download it from Firebase Console (Project Settings -> Service accounts) and set FIREBASE_SERVICE_ACCOUNT_PATH or save it as firebase-service-account.json.`
    );
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

async function getGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/devstorage.read_write',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer
    .sign(serviceAccount.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Google OAuth token exchange failed: ${data.error_description || data.error || res.status}`);
  }
  return data.access_token;
}

/**
 * Uploads a local PNG/JPEG buffer to Firebase Storage via the GCS JSON multipart upload API
 * with a `firebaseStorageDownloadTokens` UUID and returns its public HTTPS download URL.
 */
async function uploadBufferToFirebaseStorage({ accessToken, bucket, objectPath, contentType, buffer }) {
  const downloadToken = crypto.randomUUID();
  const boundary = `----whBoundary${crypto.randomBytes(12).toString('hex')}`;
  const metadataJson = JSON.stringify({
    name: objectPath,
    contentType,
    metadata: {
      firebaseStorageDownloadTokens: downloadToken,
    },
  });

  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataJson}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
    'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([head, buffer, tail]);

  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=multipart`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Firebase Storage upload failed (${res.status}): ${payload.error?.message || JSON.stringify(payload)}`);
  }

  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
}

async function deleteFromFirebaseStorage({ accessToken, bucket, objectPath }) {
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}`;
  await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function getSlideFiles(storyId) {
  if (!fs.existsSync(RENDERS_DIR)) return [];
  const prefix = `${storyId}_slide_`;
  const files = fs
    .readdirSync(RENDERS_DIR)
    .filter((f) => f.startsWith(prefix) && /\.(png|jpe?g)$/i.test(f))
    .map((f) => {
      const m = f.match(/_slide_(\d+)\.(png|jpe?g)$/i);
      return { filename: f, slideIndex: Number(m[1]), ext: m[2].toLowerCase() };
    })
    .sort((a, b) => a.slideIndex - b.slideIndex);
  return files;
}

async function graphPost(endpoint, bodyObj) {
  const res = await fetch(`${GRAPH_API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Instagram API error on ${endpoint}: ${data.error?.message || res.status}`);
  }
  return data;
}

async function waitForContainerReady(containerId, accessToken, maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${GRAPH_API_BASE}/${encodeURIComponent(containerId)}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`
    );
    const data = await res.json().catch(() => ({}));
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
      throw new Error(`Instagram media container ${containerId} failed: ${data.status || data.status_code}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timed out waiting for Instagram container ${containerId} to finish processing.`);
}

function readStoryMeta(storyId) {
  const metaPath = path.join(RENDERS_DIR, `${storyId}.meta.json`);
  let meta = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {}
  }
  return { metaPath, meta };
}

/**
 * Uploads rendered slides for `storyId` to Firebase Storage and publishes them as an
 * Instagram Carousel via the Meta Graph API. Idempotent unless `force` is true.
 */
async function publishStoryToInstagram(rawStoryId, options = {}) {
  loadDotEnv();
  const storyId = String(rawStoryId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!storyId) throw new Error('Invalid storyId');

  const { force = false } = options;
  const { metaPath, meta } = readStoryMeta(storyId);

  if (!force && meta.instagramPublished && meta.instagramMediaId) {
    return {
      ok: true,
      alreadyPublished: true,
      storyId,
      mediaId: meta.instagramMediaId,
      permalink: meta.instagramPermalink || null,
      publishedAt: meta.instagramPublishedAt || null,
      slideUrls: meta.firebaseSlideUrls || [],
    };
  }

  if (inFlightPublishes.has(storyId)) {
    return { ok: true, inProgress: true, storyId };
  }

  inFlightPublishes.add(storyId);
  try {
    const igAccessToken = process.env.IG_ACCESS_TOKEN || '';
    if (!igAccessToken) {
      throw new Error('Missing IG_ACCESS_TOKEN in environment or .env');
    }
    const igUserId = process.env.IG_USER_ID || DEFAULT_IG_USER_ID;

    const slides = getSlideFiles(storyId);
    if (slides.length < 2) {
      throw new Error(`Instagram carousels require at least 2 rendered PNG/JPEG slides (found ${slides.length} for ${storyId}).`);
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
      const objectPath = `carousels/${storyId}/${slide.filename}`;
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

    // Step 1: Create child containers for each slide
    const childIds = [];
    for (const imageUrl of slideUrls) {
      const child = await graphPost(`/${encodeURIComponent(igUserId)}/media`, {
        image_url: imageUrl,
        is_carousel_item: true,
        access_token: igAccessToken,
      });
      childIds.push(child.id);
    }

    for (const childId of childIds) {
      await waitForContainerReady(childId, igAccessToken);
    }

    // Step 2: Create parent carousel container
    const caption = String(meta.instagramCaption || meta.title || 'WE, HUMANITY').slice(0, 2200);
    const parent = await graphPost(`/${encodeURIComponent(igUserId)}/media`, {
      media_type: 'CAROUSEL',
      children: childIds,
      caption,
      access_token: igAccessToken,
    });
    await waitForContainerReady(parent.id, igAccessToken);

    // Step 3: Publish carousel
    const published = await graphPost(`/${encodeURIComponent(igUserId)}/media_publish`, {
      creation_id: parent.id,
      access_token: igAccessToken,
    });

    // Clean up temporary Firebase Storage objects now that Meta has ingested the carousel
    await Promise.allSettled(
      uploadedPaths.map((objectPath) =>
        deleteFromFirebaseStorage({ accessToken: googleToken, bucket, objectPath })
      )
    );

    let permalink = null;
    try {
      const permRes = await fetch(
        `${GRAPH_API_BASE}/${encodeURIComponent(published.id)}?fields=permalink&access_token=${encodeURIComponent(igAccessToken)}`
      );
      const permData = await permRes.json().catch(() => ({}));
      if (permData.permalink) permalink = permData.permalink;
    } catch {}

    const publishedAt = new Date().toISOString();
    meta.instagramPublished = true;
    meta.instagramMediaId = published.id;
    meta.instagramPermalink = permalink;
    meta.instagramPublishedAt = publishedAt;
    meta.firebaseSlideUrls = slideUrls;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    const pat = process.env.AIRTABLE_PAT || process.env.AIRTABLE_API_KEY || '';
    if (pat) {
      try {
        await fetch(`https://api.airtable.com/v0/appgMOSrdu95bw0nf/tblPgv6MsUEMNnvCn/${encodeURIComponent(storyId)}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { Status: 'Published' } }),
        });
      } catch {}
    }

    return {
      ok: true,
      alreadyPublished: false,
      storyId,
      mediaId: published.id,
      permalink,
      publishedAt,
      slideUrls,
    };
  } finally {
    inFlightPublishes.delete(storyId);
  }
}

module.exports = {
  loadDotEnv,
  publishStoryToInstagram,
};
