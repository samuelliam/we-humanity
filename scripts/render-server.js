#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const PORT = Number(process.env.RENDER_SERVER_PORT || 5690);
const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/svg-to-png') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-render-'));
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const svg = body.svg || '';
      const filename = (body.filename || 'slide.png').replace(/[^a-zA-Z0-9._-]/g, '_');
      const svgPath = path.join(tmpDir, 'slide.svg');
      const pngPath = path.join(tmpDir, filename);

      fs.writeFileSync(svgPath, svg, 'utf8');
      execFileSync(CHROME_BIN, [
        '--headless=new',
        '--disable-gpu',
        `--screenshot=${pngPath}`,
        '--window-size=1080,1350',
        '--hide-scrollbars',
        pathToFileURL(svgPath).href,
      ], { stdio: 'ignore' });

      const png = fs.readFileSync(pngPath);
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': png.length,
        'Content-Disposition': `attachment; filename="${filename}"`,
      });
      res.end(png);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Render server listening on http://127.0.0.1:${PORT}`);
});

