const assert = require('assert');
const m = require('./licence-filter.js');
const sample = require('./sample-commons.json');

// Licence normalisation
assert.strictEqual(m.normaliseLicence('CC BY-SA 4.0'), 'CC BY-SA');
assert.strictEqual(m.normaliseLicence('CC BY 2.0'), 'CC BY');
assert.strictEqual(m.normaliseLicence('CC BY-NC-SA 3.0'), null);
assert.strictEqual(m.normaliseLicence('CC BY-ND 4.0'), null);
assert.strictEqual(m.normaliseLicence('CC0'), 'CC0');
assert.strictEqual(m.normaliseLicence('Public domain'), 'Public domain');
assert.strictEqual(m.normaliseLicence('PD-old-70'), 'Public domain');
assert.strictEqual(m.normaliseLicence('All rights reserved'), null);
assert.strictEqual(m.normaliseLicence(''), null);

// Parse + filter each sample page
const pages = Object.values(sample.query.pages);
const parsed = pages.map(m.parseCommonsPage);
const byId = Object.fromEntries(parsed.map((c) => [c.pageid, c]));

assert.strictEqual(byId[101].artist, 'Jane Doe', 'HTML stripped from artist');
assert.strictEqual(m.filterCandidate(byId[101]).pass, true);
assert.strictEqual(m.filterCandidate(byId[102]).pass, false, 'NC licence rejected');
assert.match(m.filterCandidate(byId[102]).reasons.join(), /licence not allowed/);
assert.strictEqual(m.filterCandidate(byId[103]).pass, false, 'too small rejected');
assert.match(m.filterCandidate(byId[103]).reasons.join(), /too small/);
assert.strictEqual(m.filterCandidate(byId[104]).pass, false, 'PDF rejected');
assert.match(m.filterCandidate(byId[104]).reasons.join(), /not a supported image type/);

// Ranking: CC0 first, then by width
const ranked = m.filterAndRank(parsed);
assert.deepStrictEqual(ranked.map((c) => c.pageid), [105, 101], 'CC0 ranked above CC BY-SA');

// Credit string
const c101 = m.buildCredit(byId[101]);
assert.match(c101, /"Braun T3 pocket radio.jpg" by Jane Doe/);
assert.match(c101, /CC BY-SA/);
assert.match(c101, /creativecommons\.org\/licenses\/by-sa\/4\.0/);
assert.match(c101, /commons\.wikimedia\.org\/wiki\/File:Braun_T3_pocket_radio\.jpg/);
assert.match(c101, /no other changes/);
assert.match(m.buildCredit(byId[105]), /CC0/);
assert.match(m.buildCredit(byId[103]), /by Unknown author, public domain/);

// Missing imageinfo
assert.strictEqual(m.parseCommonsPage({ pageid: 9, title: 'x' }).ok, false);

console.log('All tests passed. Accepted, ranked:', ranked.map((c) => c.title));

// Live-data variants and entity decoding.
assert.strictEqual(m.normaliseLicence('CC BY-SA 3.0 de'), 'CC BY-SA');
assert.strictEqual(m.normaliseLicence('cc-by-sa-4.0'), 'CC BY-SA');
assert.strictEqual(m.normaliseLicence('pd'), 'Public domain');
const entityPage = JSON.parse(JSON.stringify(pages[0]));
entityPage.imageinfo[0].extmetadata.Artist = {value:'<b>A &amp; B</b> &quot;Studio&quot; &#39;One&#39; &nbsp; &#x26;'};
assert.strictEqual(m.parseCommonsPage(entityPage).artist, 'A & B "Studio" \'One\' &');
const missingURL = {...byId[101], licenseUrl:''};
assert.ok(!m.buildCredit(missingURL).includes('()'), 'missing licence URL omitted');
assert.ok(m.buildCredit(byId[101]).includes(byId[101].licenseUrl), 'licence URL retained');
const wrongObject = {...byId[101], title:'File:Braun SK 61.jpg'};
assert.strictEqual(m.filterCandidate(wrongObject).pass,true,'identity must be checked by candidate-selection stage');
console.log('Entity, licence URL and live-variant checks passed.');

// Slide token extraction, whole-word vs digit-token relevance, and rankForSlide.
const tokens = m.slideTokens({ subject: 'Braun T3 pocket radio', search_queries: ['Braun T3', 'Dieter Rams T3'] });
assert.ok(tokens.includes('braun') && tokens.includes('t3') && tokens.includes('radio'), 'extracts words and alphanumeric model codes');
assert.ok(!tokens.includes('a') && !tokens.includes('the'), 'excludes stop words');

const falseBraun = { ...byId[101], pageid: 201, title: 'File:Zdenka Braunerova painting.jpg', description: 'Oil painting', licence: 'Public domain', width: 3000 };
const realT3 = { ...byId[101], pageid: 202, title: 'File:Braun T3 pocket radio.jpg', description: 'Designed by Dieter Rams', licence: 'CC BY-SA', width: 1200 };
const widerT3 = { ...byId[101], pageid: 203, title: 'File:Braun T3 pocket radio.jpg', description: 'Designed by Dieter Rams', licence: 'CC BY-SA', width: 2400 };

assert.strictEqual(m.relevance(falseBraun, tokens), 0, 'braun must not match Braunerova');
assert.strictEqual(m.relevance({ ...byId[101], title: 'File:Braun SK 4.jpg', description: '' }, ['braun', 'sk4']), 2, 'digit token sk4 matches SK 4');

const slideRanked = m.rankForSlide([falseBraun, realT3, widerT3], tokens);
assert.deepStrictEqual(slideRanked.map((c) => c.pageid), [203, 202], 'drops 0-hit PD scan and ranks relevance then width');

const zeroHitFallback = m.rankForSlide([falseBraun], ['zzzqqq']);
assert.deepStrictEqual(zeroHitFallback.map((c) => c.pageid), [201], 'keeps passed candidates when all have 0 hits');
console.log('Relevance and slide ranking checks passed.');

// Openverse Tier 2 parser, licence normalisation, and credit builder.
assert.strictEqual(m.normaliseOpenverseLicence('cc0'), 'CC0');
assert.strictEqual(m.normaliseOpenverseLicence('pdm'), 'Public domain');
assert.strictEqual(m.normaliseOpenverseLicence('by'), 'CC BY');
assert.strictEqual(m.normaliseOpenverseLicence('by-sa'), 'CC BY-SA');
assert.strictEqual(m.normaliseOpenverseLicence('by-nc'), null);

const ovItem = {
  id: 'ov-uuid-1',
  title: 'Braun T3 Transistor Radio',
  url: 'https://example.org/braun-t3.jpg',
  foreign_landing_url: 'https://museum.example.org/items/t3',
  thumbnail: 'https://api.openverse.org/v1/images/ov-uuid-1/thumb/',
  width: 1600,
  height: 1200,
  filetype: 'jpg',
  license: 'by-sa',
  license_version: '4.0',
  license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  creator: 'Museum Archive',
  source: 'smithsonian',
  tags: [{ name: 'braun' }, { name: 'radio' }],
};
const ovParsed = m.parseOpenversePage(ovItem);
assert.strictEqual(ovParsed.ok, true);
assert.strictEqual(ovParsed.mime, 'image/jpeg');
assert.strictEqual(ovParsed.licence, 'CC BY-SA');
assert.strictEqual(ovParsed.licenceRaw, 'CC BY-SA 4.0');
assert.strictEqual(m.filterCandidate(ovParsed).pass, true);
const ovCredit = m.buildCredit(ovParsed);
assert.match(ovCredit, /"Braun T3 Transistor Radio" by Museum Archive via smithsonian/);
assert.match(ovCredit, /CC BY-SA 4\.0/);

const ovNc = m.parseOpenversePage({ ...ovItem, id: 'ov-nc', license: 'by-nc' });
assert.strictEqual(m.filterCandidate(ovNc).pass, false, 'Openverse NC rejected');
console.log('Openverse fallback checks passed.');
