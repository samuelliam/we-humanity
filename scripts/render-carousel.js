#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

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
 * Map a Story record and 6 ordered Assets into 6 slide payloads.
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
  const mid = Math.ceil(deepDive.length / 2);
  const splitAt = deepDive.indexOf('. ', Math.max(0, mid - 60));
  const dd1 = splitAt > 0 ? deepDive.slice(0, splitAt + 1) : deepDive.slice(0, mid);
  const dd2 = splitAt > 0 ? deepDive.slice(splitAt + 2) : deepDive.slice(mid);

  const copyBySlide = [
    { role: 'COVER', headline: story.Title, body: story.Pillar || '' },
    { role: 'GLANCE', headline: 'At a glance', body: story.Glance || '' },
    { role: 'EXPLORE', headline: 'Context & craft', body: story.Explore || '' },
    { role: 'DEEP DIVE', headline: 'Form & detail', body: dd1 },
    { role: 'DEEP DIVE', headline: 'Lasting impact', body: dd2 },
    { role: 'REMEMBER', headline: 'Remember', body: story.Remember || '' },
  ];

  return sorted.map((asset, idx) => ({
    slideIndex: idx + 1,
    totalSlides: 6,
    pillar: String(story.Pillar || 'WE, HUMANITY').toUpperCase(),
    role: copyBySlide[idx].role,
    headline: copyBySlide[idx].headline,
    body: copyBySlide[idx].body,
    credit: asset.Credit,
    license: asset.License || '',
    aiGenerated: !!asset['AI Generated'],
    imagePath: asset.localPath || '',
    imageUrl: (Array.isArray(asset.File) && asset.File[0] && asset.File[0].url) || '',
  }));
}

/**
 * Render one 1080x1350 (4:5) SVG slide following the WE, HUMANITY design system.
 * @param {object} slide
 * @returns {string}
 */
function renderSlideSvg(slide) {
  const headLines = wrapText(slide.headline, 28, 2);
  const bodyLines = wrapText(slide.body, 48, 5);
  const creditText = slide.aiGenerated
    ? 'Visual synthesis via Imagen 3 (WE, HUMANITY Archive Reconstruction)'
    : slide.credit;
  const creditLines = wrapText(creditText, 78, 2);
  const counter = String(slide.slideIndex).padStart(2, '0') + ' / ' + String(slide.totalSlides).padStart(2, '0');

  const imgHref = slide.imagePath && fs.existsSync(slide.imagePath)
    ? 'data:image/jpeg;base64,' + fs.readFileSync(slide.imagePath).toString('base64')
    : (slide.imageUrl ? esc(slide.imageUrl) : '');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b0b0c" stop-opacity="0.45"/>
      <stop offset="45%" stop-color="#0b0b0c" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#0b0b0c" stop-opacity="0.88"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1350" fill="#141416"/>
  ${imgHref ? `<image href="${imgHref}" x="0" y="0" width="1080" height="1350" preserveAspectRatio="xMidYMid slice"/>` : ''}
  <rect width="1080" height="1350" fill="url(#scrim)"/>
  <text x="64" y="76" fill="#F4F1EA" font-family="Helvetica Neue, Inter, sans-serif" font-size="22" font-weight="600" letter-spacing="2">WE, HUMANITY</text>
  <text x="1016" y="76" text-anchor="end" fill="#D4CFC4" font-family="Menlo, monospace" font-size="18" letter-spacing="1.5">${esc(slide.pillar)}</text>
  <rect x="56" y="840" width="968" height="396" rx="20" fill="#0E0E10" fill-opacity="0.72" stroke="#FFFFFF" stroke-opacity="0.16"/>
  <text x="92" y="892" fill="#D4B483" font-family="Menlo, monospace" font-size="17" letter-spacing="1.8">${esc(slide.role)}</text>
  ${headLines.map((l, i) => `<text x="92" y="${946 + i * 52}" fill="#FAF8F3" font-family="Georgia, serif" font-size="44" font-weight="700">${esc(l)}</text>`).join('\n  ')}
  ${bodyLines.map((l, i) => `<text x="92" y="${1056 + i * 34}" fill="#E6E2D8" font-family="Helvetica Neue, Inter, sans-serif" font-size="25">${esc(l)}</text>`).join('\n  ')}
  <text x="64" y="1302" fill="#E0E0E0" font-family="Menlo, monospace" font-size="18">${esc(counter)}</text>
  ${creditLines.map((l, i) => `<text x="1016" y="${1292 + i * 20}" text-anchor="end" fill="#CFCBC2" font-family="Helvetica Neue, Inter, sans-serif" font-size="15">${esc(l)}</text>`).join('\n  ')}
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
  const credits = slides.map((s) => `${s.slideIndex}. ${s.credit}`).join('\n');
  const manifest = {
    storyId: payload.storyId || payload.story.id || '',
    title: payload.story.Title,
    pillar: payload.story.Pillar || '',
    rendered: files.length,
    files,
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

module.exports = { buildCarouselSlides, renderSlideSvg, wrapText };

