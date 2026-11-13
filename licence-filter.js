// Deterministic licence filter and Commons response parser for WF3c.
// Pure functions: no network, no model calls.
// For n8n: paste the function bodies only. Delete the "LOCAL TEST ONLY" line at the bottom.

// Normalise a licence short name from Commons (LicenseShortName / License).
// Returns the canonical licence label, or null if not allowed.
function normaliseLicence(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (s === 'public domain' || s.startsWith('pd-') || s === 'pd') return 'Public domain';
  if (s === 'cc0' || s.startsWith('cc0 ') || s.startsWith('cc0-')) return 'CC0';
  if (/^cc[ -]by[ -]sa\b/.test(s) && !/-(nc|nd)\b/.test(s)) return 'CC BY-SA';
  if (/^cc[ -]by\b/.test(s) && !/-(nc|nd|sa)\b/.test(s)) return 'CC BY';
  return null;
}

// Parse a Commons imageinfo API page into a normalised candidate.
function parseCommonsPage(page) {
  const info = page && page.imageinfo && page.imageinfo[0];
  if (!info) return { ok: false, reason: 'no imageinfo' };
  const meta = info.extmetadata || {};
  const val = (k) => (meta[k] && meta[k].value ? String(meta[k].value) : '');
  const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, '')
    .replace(/&(amp|quot|apos|nbsp|lt|gt);|&#(x[0-9a-f]+|[0-9]+);/gi, (m, name, code) => {
      if (name) return {amp:'&',quot:'"',apos: String.fromCharCode(39),nbsp:' ',lt:'<',gt:'>'}[name.toLowerCase()];
      const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1),16) : parseInt(code,10);
      return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }).replace(/\s+/g, ' ').trim();
  const licenceRaw = val('LicenseShortName') || val('License');
  const mime = info.mime || '';
  return {
    ok: true,
    pageid: page.pageid,
    title: page.title || '',
    pageUrl: info.descriptionurl || '',
    downloadUrl: info.thumburl || info.url || '',
    originalUrl: info.url || '',
    width: info.width || null,
    height: info.height || null,
    mime,
    isImage: /^image\/(jpeg|png|tiff|webp)$/.test(mime),
    licence: normaliseLicence(licenceRaw),
    licenceRaw,
    licenseUrl: val('LicenseUrl'),
    artist: stripHtml(val('Artist')),
    credit: stripHtml(val('Credit')),
    description: stripHtml(val('ImageDescription')),
    dateCreated: stripHtml(val('DateTimeOriginal') || val('DateTime') || ''),
    usageTerms: stripHtml(val('UsageTerms')),
  };
}

// Decide whether a candidate is acceptable under the project's rules.
function filterCandidate(c) {
  const reasons = [];
  if (!c || !c.ok) reasons.push('unparseable');
  else {
    if (!c.isImage) reasons.push('not a supported image type: ' + c.mime);
    if (!c.licence) reasons.push('licence not allowed: ' + (c.licenceRaw || 'unknown'));
    if (!c.pageUrl) reasons.push('missing source page URL');
    if (!c.downloadUrl) reasons.push('missing download URL');
    if (c.width && c.width < 800) reasons.push('too small (' + c.width + 'px wide)');
  }
  return { pass: reasons.length === 0, reasons };
}

// Filter and rank candidates without slide context. CC0/PD first, then CC BY, then CC BY-SA; wider first within a tier.
function filterAndRank(candidates) {
  const rank = { 'CC0': 0, 'Public domain': 0, 'CC BY': 1, 'CC BY-SA': 2 };
  return candidates
    .map((c) => ({ c, f: filterCandidate(c) }))
    .filter((x) => x.f.pass)
    .sort((a, b) => (rank[a.c.licence] - rank[b.c.licence]) || ((b.c.width || 0) - (a.c.width || 0)))
    .map((x) => x.c);
}

const STOP_WORDS = new Set(['the','and','of','for','with','by','designed','a','an','in','on','at','from','to','its','his','her','their']);

// Extract search/subject tokens from a slide object for relevance scoring.
function slideTokens(slide) {
  const text = [(slide && slide.subject) || '', ...((slide && slide.search_queries) || [])].join(' ').toLowerCase();
  const out = new Set();
  for (const w of text.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (w.length >= 3 && !STOP_WORDS.has(w)) out.add(w);
    else if (/[a-z]/.test(w) && /[0-9]/.test(w)) out.add(w);
  }
  return [...out];
}

// Count how many slide tokens match a candidate's title + description.
// Plain words require whole-word match (so 'braun' does not match 'Braunerova');
// digit-containing tokens match in the squashed string (so 'sk4' matches 'SK 4').
function relevance(c, tokens) {
  const text = (c.title || '') + ' ' + (c.description || '');
  const words = new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const hay = text.toLowerCase().replace(/[^a-z0-9]+/g, '');
  let n = 0;
  for (const t of tokens) {
    if (/[0-9]/.test(t)) { if (hay.includes(t)) n++; }
    else if (words.has(t)) n++;
  }
  return n;
}

// Filter and rank candidates for a slide: relevance hits first, then width, then licence tier.
// Drops zero-hit candidates when at least one candidate has a hit.
function rankForSlide(candidates, tokens) {
  const licenceRank = { 'CC0': 0, 'Public domain': 0, 'CC BY': 1, 'CC BY-SA': 2 };
  const passed = candidates.filter((c) => filterCandidate(c).pass);
  const scored = passed.map((c) => ({ c, hits: relevance(c, tokens) }));
  const best = scored.reduce((m, x) => Math.max(m, x.hits), 0);
  const keep = best > 0 ? scored.filter((x) => x.hits > 0) : scored;
  return keep
    .sort((a, b) => (b.hits - a.hits)
      || ((b.c.width || 0) - (a.c.width || 0))
      || (licenceRank[a.c.licence] - licenceRank[b.c.licence]))
    .map((x) => x.c);
}

// Full attribution string. CC BY / CC BY-SA need: title, author, licence name + link,
// Commons page, and an indication of changes. Store in Assets Credit and show on the slide.
// Deterministic; never generated by the model.
function buildCredit(c) {
  if (!c) return '';
  const artist = c.artist && c.artist !== 'Unknown' ? c.artist : 'Unknown author';
  const title = (c.title || '').replace(/^File:/, '').replace(/_/g, ' ');
  if (c.licence === 'CC BY' || c.licence === 'CC BY-SA') {
    const link = c.licenseUrl ? ' (' + c.licenseUrl + ')' : '';
    return '"' + title + '" by ' + artist + ' via Wikimedia Commons (' + c.pageUrl + '), licensed under ' + (c.licenceRaw || c.licence) + link + '. Cropped and resized; no other changes.';
  }
  if (c.licence === 'CC0') {
    return '"' + title + '" by ' + artist + ', CC0 (public domain dedication), via Wikimedia Commons (' + c.pageUrl + ').';
  }
  return '"' + title + '" by ' + artist + ', public domain, via Wikimedia Commons (' + c.pageUrl + ').';
}

// LOCAL TEST ONLY: remove this line before pasting into an n8n Code node.
module.exports = { normaliseLicence, parseCommonsPage, filterCandidate, filterAndRank, slideTokens, relevance, rankForSlide, buildCredit };
