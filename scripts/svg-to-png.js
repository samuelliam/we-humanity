#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dir = process.argv[2] || path.join(process.cwd(), 'renders');
const fmt = (process.argv[3] || 'png').toLowerCase(); // 'png' or 'jpg'

if (!fs.existsSync(CHROME_BIN)) {
  console.error('Google Chrome not found at:', CHROME_BIN);
  process.exit(1);
}

const svgs = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.svg') && !f.startsWith('undefined'))
  .sort();

if (svgs.length === 0) {
  console.log('No valid .svg files found in', dir);
  process.exit(0);
}

const outFiles = [];
for (const f of svgs) {
  const svgPath = path.join(dir, f);
  const pngPath = svgPath.replace(/\.svg$/, '.png');
  execFileSync(CHROME_BIN, [
    '--headless=new',
    '--disable-gpu',
    `--screenshot=${pngPath}`,
    '--window-size=1080,1350',
    '--hide-scrollbars',
    pathToFileURL(svgPath).href,
  ], { stdio: 'ignore' });

  if (fmt === 'jpg' || fmt === 'jpeg') {
    const jpgPath = svgPath.replace(/\.svg$/, '.jpg');
    execFileSync('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', pngPath, '--out', jpgPath], { stdio: 'ignore' });
    fs.unlinkSync(pngPath);
    outFiles.push(jpgPath);
  } else {
    outFiles.push(pngPath);
  }
}

console.log(JSON.stringify({ converted: outFiles.length, format: fmt, files: outFiles }, null, 2));

