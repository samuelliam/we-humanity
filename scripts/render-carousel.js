#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const CHROME_BIN = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * Escape XML/HTML special characters for safe SVG rendering.
 * @param {string} s
 * @returns {string}
 */
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Word-wrap text into lines of at most maxChars characters.
 * @param {string} text
 * @param {number} maxChars
 * @param {number} maxLines
 * @returns {string[]}
 */
function wrapText(text, maxChars, maxLines) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if ((cur + ' ' + w).length <= maxChars) {
      cur += ' ' + w;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '...';
  }
  return lines;
}

/**
 * Condense a paragraph into a short, punchy uppercase overlay statement.
 * @param {string} text
 * @param {number} maxWords
 * @returns {string}
 */
function punchyStatement(text, maxWords) {
  const clean = String(text || '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  const firstSentence = clean.split(/(?<=[.!?])\s+/)[0] || clean;
  const words = firstSentence.split(' ');
  const clipped = words.length > maxWords ? words.slice(0, maxWords).join(' ').replace(/[,;:]$/, '') : firstSentence;
  return clipped.replace(/[.]+$/, '').toUpperCase();
}

/**
 * Map a Story record and 6 ordered Assets into 6 editorial slide payloads.
 * @param {object} story
 * @param {object[]} assets
 * @returns {object[]}
 */
function buildCarouselSlides(story, assets) {
  if (!story || !story.Title) throw new Error('Missing Story Title');
  const sorted = [...(assets || [])].sort((a, b) => (a['Slide Index'] || 0) - (b['Slide Index'] || 0));
  if (sorted.length !== 6) throw new Error('Expected exactly 6 Assets, got ' + sorted.length);
  for (let i = 0; i < 6; i++) {
    if (sorted[i]['Slide Index'] !== i + 1) throw new Error('Missing Slide Index ' + (i + 1));
    if (!sorted[i].Credit) throw new Error('Missing Credit on Slide ' + (i + 1));
  }

  const deepDive = String(story['Deep Dive'] || '').trim();
  const sentences = deepDive.split(/(?<=[.!?])\s+/).filter(Boolean);
  const dd1 = sentences[0] || deepDive;
  const dd2 = sentences[1] || sentences[0] || deepDive;

  const statements = [
    String(story.Title).toUpperCase(),
    punchyStatement(story.Glance, 9),
    punchyStatement(story.Explore, 9),
    punchyStatement(dd1, 8),
    punchyStatement(dd2, 8),
    punchyStatement(story.Remember, 10),
  ];

  return sorted.map((asset, idx) => ({
    slideIndex: idx + 1,
    totalSlides: 6,
    pillar: String(story.Pillar || 'WE, HUMANITY').toUpperCase(),
    statement: asset.overlayText ? String(asset.overlayText).toUpperCase() : statements[idx],
    style: asset.style || 'photo',
    credit: asset.Credit,
    license: asset.License || '',
    aiGenerated: !!asset['AI Generated'],
    imagePath: asset.localPath || '',
    imageUrl: (Array.isArray(asset.File) && asset.File[0] && asset.File[0].url) || '',
  }));
}

/**
 * Render one 1080x1350 (4:5) SVG slide in the clean centered-type editorial style.
 * @param {object} slide
 * @returns {string}
 */
function renderSlideSvg(slide) {
  const lines = wrapText(slide.statement, 24, 3);
  const lineHeight = 64;
  const startY = 675 - ((lines.length - 1) * lineHeight) / 2;
  const creditText = slide.aiGenerated
    ? 'Visual synthesis via Imagen 3 (WE, HUMANITY)'
    : slide.credit;
  const creditShort = wrapText(creditText, 84, 1)[0] || '';

  if (slide.style === 'card') {
    const num = '#' + String(slide.slideIndex).padStart(2, '0');
    const words = String(slide.statement || '').split(' ');
    const lead = words.slice(0, -1).join(' ');
    const accent = words[words.length - 1] || '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="#FAFAF8"/>
  <text x="64" y="96" fill="#222222" font-family="Helvetica Neue, Inter, sans-serif" font-size="26" font-weight="500">${esc(num)}</text>
  <text x="88" y="620" fill="#141414" font-family="Helvetica Neue, Inter, sans-serif" font-size="68" font-weight="400" letter-spacing="-1">${esc(lead)}</text>
  <text x="88" y="728" fill="#B8252A" font-family="Helvetica Neue, Inter, sans-serif" font-size="112" font-weight="700" letter-spacing="-2">${esc(accent)}</text>
  <text x="64" y="1286" fill="#141414" font-family="Helvetica Neue, Inter, sans-serif" font-size="28" font-weight="700" letter-spacing="1">WE, <tspan fill="#B8252A">HUMANITY</tspan></text>
</svg>`;
  }

  const imgHref = slide.imagePath && fs.existsSync(slide.imagePath)
    ? 'data:image/jpeg;base64,' + fs.readFileSync(slide.imagePath).toString('base64')
    : (slide.imageUrl ? esc(slide.imageUrl) : '');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <radialGradient id="centerGlow" cx="50%" cy="50%" r="48%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.34"/>
      <stop offset="65%" stop-color="#000000" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <filter id="textShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
  </defs>
  <rect width="1080" height="1350" fill="#E9E7E2"/>
  ${imgHref ? `<image href="${imgHref}" x="0" y="0" width="1080" height="1350" preserveAspectRatio="xMidYMid slice"/>` : ''}
  <ellipse cx="540" cy="675" rx="500" ry="210" fill="url(#centerGlow)"/>
  ${slide.slideIndex === 1 ? `<text x="56" y="88" fill="#FFFFFF" font-family="Helvetica Neue, Inter, sans-serif" font-size="26" font-weight="700" letter-spacing="3" filter="url(#textShadow)">WH</text>` : ''}
  ${lines.map((l, i) => `<text x="540" y="${startY + i * lineHeight}" text-anchor="middle" dominant-baseline="central" fill="#FFFFFF" font-family="Helvetica Neue, Inter, sans-serif" font-size="48" font-weight="500" letter-spacing="4" filter="url(#textShadow)">${esc(l)}</text>`).join('\n  ')}
  ${creditShort ? `<text x="540" y="1316" text-anchor="middle" fill="#F2F2F2" fill-opacity="0.88" font-family="Helvetica Neue, Inter, sans-serif" font-size="13" filter="url(#textShadow)">${esc(creditShort)}</text>` : ''}
</svg>`;
}

if (require.main === module) {
  let payload;
  let outDir;
  if (process.argv[2] === '--b64') {
    payload = JSON.parse(Buffer.from(process.argv[3] || '', 'base64').toString('utf8'));
    outDir = process.argv[4] || path.join(process.cwd(), 'renders', payload.storyId || 'out');
  } else {
    const inputPath = process.argv[2];
    outDir = process.argv[3] || path.join(process.cwd(), 'renders');
    if (!inputPath) {
      console.error('Usage: node scripts/render-carousel.js <payload.json|--b64 base64> [outDir]');
      process.exit(1);
    }
    payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  }

  const slides = buildCarouselSlides(payload.story, payload.assets);
  fs.mkdirSync(outDir, { recursive: true });
  const files = slides.map((s) => {
    const out = path.join(outDir, `slide_${s.slideIndex}.svg`);
    fs.writeFileSync(out, renderSlideSvg(s));
    return out;
  });

  const pngFiles = [];
  let pdfFile = null;
  if (fs.existsSync(CHROME_BIN)) {
    for (const svgPath of files) {
      const pngPath = svgPath.replace(/\.svg$/, '.png');
      execFileSync(CHROME_BIN, [
        '--headless=new',
        '--disable-gpu',
        `--screenshot=${pngPath}`,
        '--window-size=1080,1350',
        '--hide-scrollbars',
        pathToFileURL(svgPath).href,
      ], { stdio: 'ignore' });
      pngFiles.push(pngPath);
    }
    const htmlPath = path.join(outDir, 'carousel.html');
    const pages = files.map((f) => {
      const svg = fs.readFileSync(f, 'utf8').replace(/^<\?xml[^>]*\?>\s*/, '');
      return `<div class="page">${svg}</div>`;
    }).join('\n');
    fs.writeFileSync(htmlPath, `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:1080px 1350px;margin:0}html,body{margin:0;padding:0}.page{width:1080px;height:1350px;page-break-after:always;overflow:hidden}.page:last-child{page-break-after:auto}</style></head><body>${pages}</body></html>`);
    pdfFile = path.join(outDir, 'carousel.pdf');
    execFileSync(CHROME_BIN, [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${pdfFile}`,
      pathToFileURL(htmlPath).href,
    ], { stdio: 'ignore' });
  }

  const credits = slides.map((s) => `${s.slideIndex}. ${s.credit}`).join('\n');
  const manifest = {
    storyId: payload.storyId || payload.story.id || '',
    title: payload.story.Title,
    pillar: payload.story.Pillar || '',
    rendered: files.length,
    files,
    pngFiles,
    pdfFile,
    linkedinCaption: `${payload.story.Title}\n\n${payload.story.Glance || ''}\n\n${payload.story.Remember || ''}\n\nCredits:\n${credits}`,
    instagramCaption: `${payload.story.Title}\n\n${payload.story.Glance || ''}\n\nSwipe through for the full story.\n\n${payload.story.Remember || ''}`,
    xThread: {
      post1: `${payload.story.Title} — ${payload.story.Glance || ''}`.slice(0, 280),
      post2: `${payload.story.Remember || ''}`.slice(0, 280),
    },
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest));
}

module.exports = { buildCarouselSlides, renderSlideSvg, wrapText, punchyStatement };
