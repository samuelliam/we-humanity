#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

const PORT = Number(process.env.APP_PORT || 5695);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const RENDERS_DIR = path.join(ROOT_DIR, 'renders');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const N8N_BIN = process.env.N8N_BIN || '/Users/admin/.npm-global/bin/n8n';
const N8N_DB = process.env.N8N_DB || path.join(process.env.HOME || '', '.n8n', 'database.sqlite');

const PIPELINE_ENTRY_ID = 'Ifx5YGd9WgDVqvRF';
const PIPELINE_STAGES = [
  { id: 'WHWF1ResearchStory1', code: 'WF1', label: 'Backlog Research', optional: true },
  { id: 'Ifx5YGd9WgDVqvRF', code: 'WF2', label: 'Draft Story', optional: false },
  { id: 'Bnv0SFCD8oerXXhs', code: 'WF3c', label: 'Image Research', optional: false },
  { id: 'eSrdqP9mk6hg6Xls', code: 'WF4', label: 'Render Carousel', optional: false },
];

let currentPipelineRun = null;
let currentChild = null;
let lastPipelineRun = null;
let runSeq = 1;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? 'Not found' : 'Internal error');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const isAppAsset = ext === '.html' || ext === '.css' || ext === '.js';
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      ...(isAppAsset ? { 'Cache-Control': 'no-store' } : {}),
    });
    res.end(data);
  });
}

function decodeFlatted(raw) {
  const arr = JSON.parse(raw);
  const seen = new Map();
  function decode(val) {
    if (typeof val === 'string' && /^\d+$/.test(val)) {
      const idx = Number(val);
      if (seen.has(idx)) return seen.get(idx);
      const target = arr[idx];
      if (target && typeof target === 'object') {
        const out = Array.isArray(target) ? [] : {};
        seen.set(idx, out);
        if (Array.isArray(target)) {
          for (const v of target) out.push(decode(v));
        } else {
          for (const [k, v] of Object.entries(target)) out[k] = decode(v);
        }
        return out;
      }
      return target;
    }
    return val;
  }
  return decode('0');
}

function querySqliteJson(sql) {
  if (!fs.existsSync(N8N_DB)) return [];
  try {
    const out = execFileSync('sqlite3', ['-json', N8N_DB, sql], { maxBuffer: 50 * 1024 * 1024 }).toString('utf8').trim();
    return out ? JSON.parse(out) : [];
  } catch {
    return [];
  }
}

function loadStoryMetadataFromN8n(neededStoryIds) {
  const byStory = new Map();
  if (!neededStoryIds.length) return byStory;

  // 1. Read fast cached <storyId>.meta.json files from renders/
  const missing = [];
  for (const storyId of neededStoryIds) {
    const metaPath = path.join(RENDERS_DIR, `${storyId}.meta.json`);
    if (fs.existsSync(metaPath)) {
      try {
        byStory.set(storyId, JSON.parse(fs.readFileSync(metaPath, 'utf8')));
        continue;
      } catch {
        // Re-extract if corrupted
      }
    }
    missing.push(storyId);
  }

  if (!missing.length) return byStory;

  // 2. Only query n8n SQLite for stories missing a .meta.json cache
  const execIds = querySqliteJson(`
    SELECT e.id AS executionId, e.startedAt, e.stoppedAt
    FROM execution_entity e
    WHERE e.workflowId = 'eSrdqP9mk6hg6Xls' AND e.status = 'success'
    ORDER BY e.id DESC
    LIMIT 10;
  `);

  for (const row of execIds) {
    if (missing.every((id) => byStory.has(id))) break;
    const dataRows = querySqliteJson(`SELECT data FROM execution_data WHERE executionId = ${Number(row.executionId)};`);
    if (!dataRows[0]?.data) continue;
    try {
      const root = decodeFlatted(dataRows[0].data);
      const runItems = root?.resultData?.runData?.['Render Carousel Slides']?.[0]?.data?.main?.[0];
      if (!Array.isArray(runItems) || runItems.length === 0) continue;
      for (const item of runItems) {
        const j = item?.json;
        if (!j?.storyId || byStory.has(j.storyId)) continue;
        const meta = {
          storyId: j.storyId,
          title: j.title || j.storyId,
          pillar: j.pillar || '',
          instagramCaption: j.instagramCaption || '',
          linkedinCaption: j.linkedinCaption || '',
          xThread: j.xThread || null,
          credits: Array.isArray(j.credits) ? j.credits : [],
          executionId: row.executionId,
          renderedAt: row.stoppedAt || row.startedAt,
        };
        byStory.set(j.storyId, meta);
        try {
          fs.writeFileSync(path.join(RENDERS_DIR, `${j.storyId}.meta.json`), JSON.stringify(meta, null, 2));
        } catch {
          // Non-fatal cache write error
        }
      }
    } catch {
      // Skip malformed execution rows
    }
  }
  return byStory;
}

function getStories() {
  if (!fs.existsSync(RENDERS_DIR)) return [];
  const files = fs.readdirSync(RENDERS_DIR);
  const grouped = new Map();

  for (const file of files) {
    const m = file.match(/^(.+?)_slide_(\d+)\.(png|jpe?g|svg)$/i);
    if (!m) continue;
    const [, storyId, slideNumStr, ext] = m;
    const slideIndex = Number(slideNumStr);
    const format = ext.toLowerCase() === 'svg' ? 'svg' : 'raster';
    if (!grouped.has(storyId)) grouped.set(storyId, new Map());
    const slidesMap = grouped.get(storyId);
    const existing = slidesMap.get(slideIndex);
    // Prefer raster PNG/JPEG over SVG when both exist
    if (!existing || (existing.format === 'svg' && format === 'raster')) {
      const stat = fs.statSync(path.join(RENDERS_DIR, file));
      slidesMap.set(slideIndex, {
        slideIndex,
        filename: file,
        url: `/renders/${encodeURIComponent(file)}`,
        format,
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    }
  }

  const metaMap = loadStoryMetadataFromN8n([...grouped.keys()]);
  const stories = [];
  for (const [storyId, slidesMap] of grouped.entries()) {
    const slides = [...slidesMap.values()].sort((a, b) => a.slideIndex - b.slideIndex);
    const meta = metaMap.get(storyId) || {};
    const latestMtime = Math.max(...slides.map((s) => s.mtimeMs));
    stories.push({
      storyId,
      title: meta.title || storyId,
      pillar: meta.pillar || 'WE, HUMANITY',
      instagramCaption: meta.instagramCaption || '',
      linkedinCaption: meta.linkedinCaption || '',
      xThread: meta.xThread || null,
      credits: meta.credits || [],
      renderedAt: meta.renderedAt || new Date(latestMtime).toISOString(),
      executionId: meta.executionId || null,
      slides,
    });
  }

  stories.sort((a, b) => new Date(b.renderedAt).getTime() - new Date(a.renderedAt).getTime());
  return stories;
}

function toSqliteUtc(isoString) {
  return isoString.replace('T', ' ').replace('Z', '');
}

function parseSqliteUtcMs(sqlTs) {
  if (!sqlTs) return null;
  const iso = String(sqlTs).includes('T') ? sqlTs : String(sqlTs).replace(' ', 'T') + 'Z';
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function countRecentFiles(dir, sinceMs, extRegex) {
  if (!sinceMs || !fs.existsSync(dir)) return 0;
  try {
    let count = 0;
    for (const file of fs.readdirSync(dir)) {
      if (!extRegex.test(file)) continue;
      const stat = fs.statSync(path.join(dir, file));
      if (stat.mtimeMs >= sinceMs - 1000) count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}

function computeDurationSec(startTs, stopTs) {
  const startMs = parseSqliteUtcMs(startTs);
  if (!startMs) return null;
  const stopMs = stopTs ? parseSqliteUtcMs(stopTs) : Date.now();
  if (!stopMs) return null;
  return Math.max(1, Math.round((stopMs - startMs) / 1000));
}

function getPipelineStatus() {
  const refRun = currentPipelineRun || lastPipelineRun;
  let sinceSql = null;

  if (refRun) {
    sinceSql = toSqliteUtc(new Date(new Date(refRun.startedAt).getTime() - 2000).toISOString());
  } else {
    const latestWf2 = querySqliteJson(`
      SELECT startedAt FROM execution_entity
      WHERE workflowId = '${PIPELINE_ENTRY_ID}'
      ORDER BY id DESC LIMIT 1;
    `);
    if (latestWf2[0]?.startedAt) {
      sinceSql = toSqliteUtc(new Date(new Date(latestWf2[0].startedAt.replace(' ', 'T') + 'Z').getTime() - 60000).toISOString());
    }
  }

  const execRows = sinceSql
    ? querySqliteJson(`
        SELECT id, workflowId, status, startedAt, stoppedAt
        FROM execution_entity
        WHERE workflowId IN ('WHWF1ResearchStory1','Ifx5YGd9WgDVqvRF','Bnv0SFCD8oerXXhs','eSrdqP9mk6hg6Xls')
          AND startedAt >= '${sinceSql}'
        ORDER BY id DESC;
      `)
    : [];

  const byWf = new Map();
  for (const row of execRows) {
    if (!byWf.has(row.workflowId)) byWf.set(row.workflowId, row);
  }

  const wf1Exec = byWf.get('WHWF1ResearchStory1') || null;
  const wf2Exec = byWf.get(PIPELINE_ENTRY_ID) || null;
  const wf3cExec = byWf.get('Bnv0SFCD8oerXXhs') || null;
  const wf4Exec = byWf.get('eSrdqP9mk6hg6Xls') || null;

  if (currentPipelineRun && wf2Exec && wf2Exec.stoppedAt) {
    currentPipelineRun.status = wf2Exec.status === 'success' ? 'success' : 'error';
    currentPipelineRun.finishedAt = new Date().toISOString();
    currentPipelineRun = null;
    if (currentChild) {
      const childToKill = currentChild;
      currentChild = null;
      setTimeout(() => { try { childToKill.kill('SIGTERM'); } catch {} }, 1500);
    }
  }

  const wf2StartMs = parseSqliteUtcMs(wf2Exec?.startedAt);
  const idleMode = !refRun && !sinceSql;

  const stages = PIPELINE_STAGES.map((stage) => {
    let state = idleMode ? 'idle' : 'waiting';
    let activeStartedAt = null;
    let activeStoppedAt = null;
    let detail = null;

    if (stage.id === 'WHWF1ResearchStory1') {
      if (wf1Exec) {
        state = wf1Exec.status === 'running' ? 'running' : wf1Exec.status === 'success' ? 'success' : 'error';
        activeStartedAt = wf1Exec.startedAt;
        activeStoppedAt = wf1Exec.stoppedAt;
        if (state === 'running') detail = 'Researching archival story candidates with Gemini…';
      } else if (wf2Exec && (wf3cExec || wf2Exec.stoppedAt || (wf2StartMs && Date.now() - wf2StartMs > 4000))) {
        state = 'skipped';
      }
    } else if (stage.id === 'Ifx5YGd9WgDVqvRF') {
      const ownStart = wf1Exec?.stoppedAt || wf2Exec?.startedAt || null;
      if (wf1Exec?.status === 'running') {
        state = 'waiting';
      } else if (wf3cExec) {
        state = 'success';
        activeStartedAt = ownStart;
        activeStoppedAt = wf3cExec.startedAt;
      } else if (wf2Exec) {
        state = wf2Exec.status === 'running' ? 'running' : wf2Exec.status === 'success' ? 'success' : 'error';
        activeStartedAt = ownStart;
        activeStoppedAt = wf2Exec.stoppedAt;
        if (state === 'running') detail = 'Drafting story sections (Glance, Explore, Deep Dive, Remember)…';
      } else if (currentPipelineRun) {
        state = 'running';
        activeStartedAt = toSqliteUtc(new Date(currentPipelineRun.startedAt).toISOString());
        detail = 'Starting WF2 workflow…';
      }
    } else if (stage.id === 'Bnv0SFCD8oerXXhs') {
      if (wf4Exec) {
        state = 'success';
        activeStartedAt = wf3cExec?.startedAt || null;
        activeStoppedAt = wf4Exec.startedAt;
      } else if (wf3cExec) {
        state = wf3cExec.status === 'running' ? 'running' : wf3cExec.status === 'success' ? 'success' : 'error';
        activeStartedAt = wf3cExec.startedAt;
        activeStoppedAt = wf3cExec.stoppedAt;
        if (state === 'running') {
          const n = countRecentFiles(ASSETS_DIR, parseSqliteUtcMs(wf3cExec.startedAt), /_slide_\d+\.(jpe?g|png|webp)$/i);
          detail = n === 0
            ? 'Planning slides & searching Wikimedia / Openverse…'
            : `Downloaded / generated ${n} slide image${n === 1 ? '' : 's'} & uploading to Airtable…`;
        }
      }
    } else if (stage.id === 'eSrdqP9mk6hg6Xls') {
      if (wf4Exec) {
        state = wf4Exec.status === 'running' ? 'running' : wf4Exec.status === 'success' ? 'success' : 'error';
        activeStartedAt = wf4Exec.startedAt;
        activeStoppedAt = wf4Exec.stoppedAt;
        if (state === 'running') {
          const n = countRecentFiles(RENDERS_DIR, parseSqliteUtcMs(wf4Exec.startedAt), /_slide_\d+\.png$/i);
          detail = n === 0
            ? 'Polishing carousel copy & building slide SVGs…'
            : `Rendered ${n} slide PNG${n === 1 ? '' : 's'} (1080×1350)…`;
        }
      }
    }

    return {
      code: stage.code,
      label: stage.label,
      state,
      startedAt: activeStartedAt,
      stoppedAt: activeStoppedAt,
      durationSec: computeDurationSec(activeStartedAt, activeStoppedAt),
      detail,
    };
  });

  return {
    running: Boolean(currentPipelineRun),
    run: refRun,
    stages,
  };
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function runN8nWorkflow(workflowId, onDone) {
  return execFile(N8N_BIN, ['execute', `--id=${workflowId}`, '--rawOutput'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      N8N_RUNNERS_BROKER_PORT: process.env.N8N_EXECUTE_BROKER_PORT || '5680',
      N8N_RESTRICT_FILE_ACCESS_TO: process.env.N8N_RESTRICT_FILE_ACCESS_TO || ROOT_DIR,
    },
    timeout: 8 * 60 * 1000,
    maxBuffer: 20 * 1024 * 1024,
  }, onDone);
}

function triggerPipeline(options = {}) {
  if (currentPipelineRun) {
    return { error: 'Pipeline is already running', status: 409 };
  }

  const subject = String(options.subject || '').trim();
  const subTheme = String(options.subTheme || '').trim();
  const hasCustomOptions = Boolean(subject || subTheme);
  const optionsFile = path.join(ROOT_DIR, '.studio-run-options.json');

  if (hasCustomOptions) {
    fs.writeFileSync(optionsFile, JSON.stringify({ subject, subTheme }), 'utf8');
  } else {
    try { fs.unlinkSync(optionsFile); } catch {}
  }

  const run = {
    runId: `run-${runSeq++}`,
    workflowId: PIPELINE_ENTRY_ID,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  };

  currentPipelineRun = run;
  lastPipelineRun = run;

  const finishRun = (err, stdout, stderr) => {
    currentChild = null;
    try { fs.unlinkSync(optionsFile); } catch {}
    if (run.stopped) return;
    if (currentPipelineRun === run) {
      currentPipelineRun = null;
      run.finishedAt = new Date().toISOString();
      if (err) {
        run.status = 'error';
        run.error = [stderr, stdout, err.message].filter(Boolean).join('\n').trim().slice(-400);
      } else {
        run.status = 'success';
      }
    }
  };

  if (hasCustomOptions) {
    currentChild = runN8nWorkflow('WHWF1ResearchStory1', (err, stdout, stderr) => {
      try { fs.unlinkSync(optionsFile); } catch {}
      if (run.stopped) return;
      if (err) return finishRun(err, stdout, stderr);
      currentChild = runN8nWorkflow(PIPELINE_ENTRY_ID, finishRun);
    });
  } else {
    currentChild = runN8nWorkflow(PIPELINE_ENTRY_ID, finishRun);
  }

  return { run, status: 202 };
}

function rerenderStory(storyId) {
  if (currentPipelineRun) {
    return { error: 'Pipeline is already running', status: 409 };
  }
  const cleanId = String(storyId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanId) return { error: 'Invalid story ID', status: 400 };

  const rerenderFile = path.join(ROOT_DIR, '.studio-rerender.json');
  fs.writeFileSync(rerenderFile, JSON.stringify({ storyId: cleanId }), 'utf8');

  const run = {
    runId: `run-${runSeq++}`,
    workflowId: 'eSrdqP9mk6hg6Xls',
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  };

  currentPipelineRun = run;
  lastPipelineRun = run;

  currentChild = runN8nWorkflow('eSrdqP9mk6hg6Xls', (err, stdout, stderr) => {
    currentChild = null;
    try { fs.unlinkSync(rerenderFile); } catch {}
    if (run.stopped) return;
    if (currentPipelineRun === run) {
      currentPipelineRun = null;
      run.finishedAt = new Date().toISOString();
      if (err) {
        run.status = 'error';
        run.error = [stderr, stdout, err.message].filter(Boolean).join('\n').trim().slice(-400);
      } else {
        run.status = 'success';
      }
    }
  });

  return { run, status: 202 };
}

function stopPipeline() {
  if (!currentPipelineRun) {
    return { error: 'No pipeline run is currently active', status: 409 };
  }

  const run = currentPipelineRun;
  run.stopped = true;
  run.status = 'stopped';
  run.finishedAt = new Date().toISOString();
  run.error = 'Stopped by user.';
  currentPipelineRun = null;

  try { fs.unlinkSync(path.join(ROOT_DIR, '.studio-run-options.json')); } catch {}
  try { fs.unlinkSync(path.join(ROOT_DIR, '.studio-rerender.json')); } catch {}

  if (currentChild) {
    const child = currentChild;
    currentChild = null;
    try { child.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 1500);
  }

  return { run, status: 200 };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === 'GET' && pathname === '/api/stories') {
    return sendJson(res, 200, { stories: getStories() });
  }

  if (req.method === 'GET' && pathname === '/api/pipeline') {
    return sendJson(res, 200, getPipelineStatus());
  }

  if (req.method === 'POST' && pathname === '/api/pipeline/trigger') {
    const body = await readJsonBody(req);
    const result = triggerPipeline(body);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    return sendJson(res, result.status, { run: result.run });
  }

  if (req.method === 'POST' && pathname === '/api/pipeline/stop') {
    const result = stopPipeline();
    if (result.error) return sendJson(res, result.status, { error: result.error });
    return sendJson(res, result.status, { run: result.run });
  }

  const rerenderMatch = req.method === 'POST' && pathname.match(/^\/api\/stories\/([^/]+)\/rerender$/);
  if (rerenderMatch) {
    const result = rerenderStory(rerenderMatch[1]);
    if (result.error) return sendJson(res, result.status, { error: result.error });
    return sendJson(res, result.status, { run: result.run });
  }

  if (req.method === 'GET' && pathname.startsWith('/renders/')) {
    const rel = path.basename(pathname);
    return serveFile(res, path.join(RENDERS_DIR, rel));
  }

  if (req.method === 'GET') {
    const safeRel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(PUBLIC_DIR, safeRel);
    if (!target.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    return serveFile(res, target);
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`WE, HUMANITY Studio listening on http://127.0.0.1:${PORT}`);
});

