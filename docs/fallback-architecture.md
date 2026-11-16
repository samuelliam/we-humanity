# WF3c Fallback Architecture Design: Multi-Tiered Asset Sourcing

**Document Version:** 1.0.0  
**Project:** WE, HUMANITY (WF3c Research Slide Images Pipeline)  
**Date:** 2026-11-13  
**Status:** Architecture Specification  

---

## 1. Executive Summary

In the **WE, HUMANITY** workflow pipeline, WF3c is tasked with finding licensed images relevant to a 6-slide carousel story. While Wikimedia Commons serves as the primary repository, empirical runs (notably the 11 November rate-limit event and historical runs 168–173) demonstrated that Wikimedia Commons can suffer from:
1. HTTP 429 rate-limiting blocks under repeated automated queries.
2. Sparse candidate coverage for specific modern design objects or detailed mechanisms.
3. Loosely matched search results that return irrelevant scans (manuscripts, maps, paintings) instead of physical design objects.
4. Model-level candidate rejections where no acceptable candidate survives license and relevance ranking.

To guarantee that **every slide receives an image** (per user policy decision, 11 November) while strictly upholding copyright compliance, attribution integrity, and editorial aesthetic standards, this document specifies a resilient **3-Tier Sourcing and Fallback Architecture**:
* **Tier 1 (Primary):** Wikimedia Commons API (Editorial archive search).
* **Tier 2 (Secondary Fallback):** Openverse API v1 (Federated search across 800M+ open museum, cultural heritage, and CC archives).
* **Tier 3 (Tertiary Fallback):** AI Photorealistic Synthesis (Google Imagen 3 / Flux.1 Dev via structured editorial prompts, with explicit `AI Generated: true` metadata tagging).

---

## 2. Fallback Trigger Conditions & Decision Matrix

A slide transitions through the fallback tiers sequentially. A higher-tier fallback is triggered immediately upon encountering any of the following terminal conditions in the preceding tier:

| Trigger Condition | Detection Mechanism in n8n | Next Action |
|---|---|---|
| **Zero Raw Results** | Query returns 0 items in API response (`query.pages` empty in Commons, `results: []` in Openverse). | Advance to broader query variant; if still 0, advance to next Tier. |
| **Zero Filtered Candidates** | Raw results exist, but `licence-filter` rejects 100% of candidates due to invalid license (NC/ND), non-image MIME, or width < 800px. | Advance to next Tier immediately. |
| **Relevance Exclusion** | Candidates pass license check but achieve 0 token hits against the slide subject/queries, indicating semantic drift (e.g., painting of a unrelated artist). | Advance to next Tier immediately. |
| **Model Rejection** | Gemini (`Choose Candidate`) returns `chosen_pageid: null` or confidence `low` with reason citing incorrect model/subject. | Advance to next Tier. |
| **Exhausted Candidate Pool** | Gemini picks an image already assigned to an earlier slide (`duplicate`), and all remaining candidates in the ranked pool have also been claimed. | Advance to next Tier. |
| **API Failure / Rate Limiting** | HTTP 429 (Too Many Requests), HTTP 503, or connection timeout (`ETIMEDOUT`) after configured retries. | Circuit-break current tier; route remaining slides to next Tier without stalling the pipeline. |
| **Binary Verification Failure** | File download returns corrupted payload, non-image MIME type, or size $\le$ 10,240 bytes. | Discard candidate; evaluate next candidate in pool; if pool empty, advance to next Tier. |

---

## 3. Tier Specifications & Technical Integration

### 3.1 Tier 1: Wikimedia Commons API (Baseline)
* **Endpoint:** `GET https://commons.wikimedia.org/w/api.php`
* **Query Parameters:**
  ```text
  action=query
  format=json
  generator=search
  gsrnamespace=6
  gsrlimit=20
  gsrsearch={{ encodeURIComponent(query + ' filetype:bitmap') }}
  prop=imageinfo
  iiprop=url|extmetadata|mime|size
  iiurlwidth=1200
  ```
* **Pacing & Protection:** 3-second wait between batches, maximum 3 retries with 10,000 ms backoff.
* **Filter:** `parseCommonsPage` + `rankForSlide` (relevance > width > license).

---

### 3.2 Tier 2: Openverse API v1 Integration

The WordPress.org Openverse API indexes over 800 million Creative Commons and public domain images across cultural institutions (e.g. Smithsonian, Cleveland Museum of Art, Rijksmuseum, Flickr CC, Europeana, Rawpixel).

#### 3.2.1 API Configuration & Authentication
* **Base URL:** `https://api.openverse.org/v1/`
* **Endpoint:** `GET https://api.openverse.org/v1/images/`
* **Authentication:** OAuth2 Client Credentials.
  * Endpoint: `POST https://api.openverse.org/v1/auth_tokens/token/`
  * Header: `Content-Type: application/x-www-form-urlencoded`
  * Body: `grant_type=client_credentials&client_id={{ $env.OPENVERSE_CLIENT_ID }}&client_secret={{ $env.OPENVERSE_CLIENT_SECRET }}`
  * Token Lifecycle: 12-hour lifetime (`OAuth2Token.expires_in: 43200`). n8n handles token refresh via OAuth2 or generic HTTP credentials.
* **Search Parameters:**
  ```http
  GET /v1/images/?q={{ encodeURIComponent(query) }}&license_type=commercial,modification&page_size=15&aspect_ratio=tall,square,wide
  ```
  * `license_type=commercial,modification`: **Critical filter**. Guarantees at query-time that returned assets exclude NC (Non-Commercial) and ND (No-Derivatives) restrictions, matching WE, HUMANITY publishing rights.
  * Explicit license override: `license=cc0,pdm,by,by-sa`.
  * Excluded sources: Exclude Wikimedia Commons from Openverse query (`excluded_sources=wikimedia`) to prevent redundant results already evaluated in Tier 1.

#### 3.2.2 Openverse Parser & Normalisation Adapter
To seamlessly plug into the existing downstream nodes (`rankForSlide`, `Choose Candidate`, `buildCredit`), Openverse items are normalized to the existing `candidate` schema:

```javascript
// Openverse Normalisation Adapter for n8n Code Node
function parseOpenversePage(item) {
  if (!item || !item.id) return { ok: false, reason: 'invalid item payload' };

  // Map Openverse license strings to WE, HUMANITY canonical strings
  function normaliseOpenverseLicence(lic, ver) {
    if (!lic) return null;
    const l = lic.toLowerCase();
    if (l === 'cc0') return 'CC0';
    if (l === 'pdm' || l === 'public domain') return 'Public domain';
    if (l === 'by') return 'CC BY';
    if (l === 'by-sa') return 'CC BY-SA';
    return null; // NC / ND blocked by license_type query param
  }

  const mime = item.filetype ? `image/${item.filetype.toLowerCase()}` : 'image/jpeg';
  const rawLicence = item.license ? `CC ${item.license.toUpperCase()} ${item.license_version || ''}`.trim() : '';

  return {
    ok: true,
    pageid: item.id, // UUID string
    title: item.title || 'Untitled',
    pageUrl: item.foreign_landing_url || item.url || '',
    downloadUrl: item.url, // Full-resolution media URL
    originalUrl: item.url,
    thumbnailUrl: item.thumbnail,
    width: item.width || 1200,
    height: item.height || null,
    mime: mime,
    isImage: true,
    licence: normaliseOpenverseLicence(item.license, item.license_version),
    licenceRaw: rawLicence,
    licenseUrl: item.license_url || '',
    artist: item.creator || 'Unknown author',
    credit: item.attribution || '',
    description: (item.title || '') + (item.tags ? ' ' + item.tags.map(t => t.name).join(' ') : ''),
    dateCreated: '',
    sourceProvider: item.source || 'Openverse',
    tier: 'Tier 2: Openverse'
  };
}

// Openverse Attribution String Builder
function buildOpenverseCredit(c) {
  if (!c) return '';
  const artist = c.artist && c.artist !== 'Unknown' ? c.artist : 'Unknown author';
  const title = (c.title || 'Untitled').replace(/"/g, "'");
  const source = c.sourceProvider || 'Openverse';
  
  if (c.licence === 'CC BY' || c.licence === 'CC BY-SA') {
    const link = c.licenseUrl ? ` (${c.licenseUrl})` : '';
    return `"${title}" by ${artist} via ${source} (${c.pageUrl}), licensed under ${c.licenceRaw || c.licence}${link}. Cropped and resized; no other changes.`;
  }
  if (c.licence === 'CC0') {
    return `"${title}" by ${artist}, CC0 (public domain dedication), via ${source} (${c.pageUrl}).`;
  }
  return `"${title}" by ${artist}, public domain, via ${source} (${c.pageUrl}).`;
}
```

---

### 3.3 Tier 3: AI Photorealistic Image Generation

Under the user policy decision of 11 November 2026, AI-generated images are officially permitted when historical/archive searches fail, provided they are relevant, high-resolution, and logged with `AI Generated: true`.

#### 3.3.1 Engine Selection & Trade-offs
1. **Google Imagen 3 (`imagen-3.0-generate-002`) [Primary Recommendation]:**
   * *Rationale:* Leverages existing Google Vertex AI / Google AI Studio credentials already integrated and authenticated in n8n for Gemini (`gemini-3.8-flash`). No new third-party subscriptions or egress tunnels required.
   * *Capabilities:* Exceptional rendering of matte surfaces, industrial materials, typography avoidance, and authentic studio lighting.
2. **Flux.1 [Dev] / [Pro] via Replicate API [Alternative]:**
   * *Rationale:* Industry benchmark for photorealism, industrial design textures (plastics, brushed metal, woodgrain), and strict prompt adherence. Requires Replicate API token.

#### 3.3.2 Editorial Prompt Engineering Matrix
Prompts must strictly align with the **WE, HUMANITY** visual aesthetic: reverent, tactile, museum documentary photography, avoiding all "generic AI sheen", oversaturation, and surreal distortion.

* **Base Prompt Template:**
  ```text
  Archival museum documentary photograph of [EXACT_HISTORICAL_SUBJECT], designed by [DESIGNER_NAME], circa [YEAR].
  View: [ANGLE_AND_FRAMING, e.g., straight-on elevation / 45-degree isometric studio capture].
  Physical details: authentic [MATERIALS, e.g., matte warm-gray polystyrene casing, brushed aluminum faceplate, subtle mechanical bevels].
  Lighting: soft diffuse museum gallery lighting, neutral off-white matte background, gentle natural cast shadows.
  Photography: shot on 35mm Hasselblad medium format camera, 80mm lens, f/8 aperture, razor-sharp optical focus, natural organic fine film grain.
  Strict negative constraints: no text, no logos, no modern accessories, no digital blur, no CGI render look, no 3D cartoon shading, no distortion.
  ```

* **Automated Prompt Construction Node in n8n:**
  Gemini is invoked to convert the slide's `subject` + story context into an optimized Imagen 3 generation prompt.

#### 3.3.3 Tier 3 Metadata Logging Contract
When Tier 3 is engaged, the asset payload is tagged with:
* `Type`: `'image'`
* `AI Generated`: `true`
* `License`: `'Custom / AI Generated (WE, HUMANITY)'`
* `Source URL`: `'urn:ai:imagen-3:' + job_id`
* `Model`: `'models/imagen-3.0-generate-002'`
* `Generation Prompt`: Exact prompt string used for the image synthesis.
* `Credit`: `'Visual synthesis generated with Imagen 3 for WE, HUMANITY. Archive reference reconstruction.'`
* `Confidence`: `'medium'` (Ensures human editor review is mandatory in Airtable).

---

## 4. n8n Workflow Topology & Node Architecture

The integrated workflow extends the existing 34-node DAG without disturbing the existing Commons Search pacing or verification safeguards.

```
[Expand Queries]
       │
       ▼
[Loop Search Batches] ──► [Commons Search (Tier 1)]
       │                          │
       │                          ▼
       │                 [Parse and Filter]
       │                          │
       ▼                          ▼
[Has Commons Candidates?] ──► YES ──► [Choose Candidate (Gemini)]
       │                                     │
       NO (0 candidates or rate limit)       ▼
       ▼                              [Apply Choice]
[Openverse Search (Tier 2)]                  │
       │                                     ▼
       ▼                              [Selected Candidate]
[Parse & Filter Openverse]                   │
       │                                     │
       ▼                                     │
[Has Openverse Candidates?] ──► YES ─────────┘
       │
       NO
       ▼
[AI Image Synthesis (Tier 3)]
       │
       ▼
[Format AI Asset Payload] ───────────────────┐
                                             │
                                             ▼
                                     [Download & Verify Image]
                                             │
                                             ▼
                                     [Save File to Local Disk]
                                             │
                                             ▼
                                     [Build Assets Record]
                                             │
                                             ▼
                                     [Create Asset in Airtable]
                                             │
                                             ▼
                                     [Upload Attachment File]
```

### 4.1 Node Configuration Specifications

#### Node A: `Check Sourcing Fallback` (n8n IF Node)
* **Input:** Output of `Parse and Filter`.
* **Condition:** `={{ $json.candidates && $json.candidates.length > 0 }}`
* **True Branch:** Routes to `Choose Candidate` (Tier 1).
* **False Branch:** Routes to `Format Openverse Query` (Tier 2).

#### Node B: `Format Openverse Query` (n8n Code Node)
* Cleans slide subject, strips generic words (`GENERIC` set), appends primary keywords.
* Outputs query payload: `{ query: cleanedQuery, slide_index, subject, storyId }`.

#### Node C: `Openverse Search` (n8n HTTP Request Node)
* **Method:** `GET`
* **URL:** `=https://api.openverse.org/v1/images/?q={{ encodeURIComponent($json.query) }}&license_type=commercial,modification&page_size=10&excluded_sources=wikimedia`
* **Headers:**
  ```json
  {
    "Authorization": "={{ 'Bearer ' + $('Get Openverse Token').first().json.access_token }}",
    "User-Agent": "WeHumanity/1.0 (licensed editorial image research; contact: linedesign.works@gmail.com)"
  }
  ```
* **Options:** Timeout 6000 ms, Retry on fail (2 tries, 3000 ms wait).

#### Node D: `Parse and Filter Openverse` (n8n Code Node)
* Executes `parseOpenversePage` and `rankForSlide`.
* Evaluates candidate width ($\ge 800\text{px}$) and license validity.

#### Node E: `Generate AI Image` (n8n HTTP Request / LangChain Node)
* **Trigger:** Engaged if Openverse returns 0 valid candidates.
* **Model:** Google Imagen 3 via Vertex AI endpoint or Replicate Flux.1 API.
* **Payload:** Formatted JSON request with prompt, aspect ratio (`1:1` or `4:5`), resolution (`1080x1350`).
* **Binary Handling:** Streams generated image buffer directly to `Verify Image`.

---

## 5. Airtable Schema Updates

To support the multi-tier fallback architecture, the following updates must be configured in Airtable:

### 5.1 `Assets` Table (`tbl8HCdgugwL3SZjy`)

| Field Name | Type | Options / Configuration | Purpose |
|---|---|---|---|
| **Asset Tier** | Single Select | `Tier 1: Wikimedia Commons`<br>`Tier 2: Openverse`<br>`Tier 3: AI Generated`<br>`Manual Review Supply` | Tracks exactly which pipeline tier sourced the asset for governance. |
| **License** | Single Select | *Add missing options:*<br>`CC BY 2.0`<br>`CC BY 3.0`<br>`CC BY-SA 2.0`<br>`CC BY-SA 3.0`<br>`Custom / AI Generated` | Prevents Airtable API reject on non-4.0 licenses returned by Openverse. |
| **Openverse Provider** | Single Line Text | e.g., `Smithsonian`, `Flickr`, `Rawpixel` | Preserves institution credit when sourced from Openverse. |
| **AI Generated** | Checkbox | Default: Unchecked | Existing field; set to `true` on Tier 3 assets. |
| **Generation Prompt** | Long Text | Plaintext | Stores search query (Tier 1/2) or synthesis prompt (Tier 3). |
| **Credit** | Long Text | Rich text / Plaintext | Deterministically formatted legal attribution line. |
| **Original Dimensions** | Single Line Text | e.g. `2400x1800` | Records source resolution prior to social formatting. |

### 5.2 `Stories` Table (`tblPgv6MsUEMNnvCn`)

| Field Name | Type | Options / Configuration | Purpose |
|---|---|---|---|
| **Sourcing Status** | Single Select | `Pending`<br>`Commons Sourced`<br>`Fallback Sourced (Mixed)`<br>`AI Sourced`<br>`Needs Review` | High-level indicator for editorial production dashboards. |
| **Flags** | Multiple Select / Text | Existing field: Append `image needs review` or `ai image review` | Preserves all existing flags without overwriting. |
| **Reviewer Notes** | Long Text | Append-only log | Logs specific slide fallback transitions and model confidence reasons. |

---

## 6. Error Handling, Rate Limiting & Resilience Matrix

```
                        ┌───────────────────────────────┐
                        │      Search Commons (T1)       │
                        └──────────────┬────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
             [HTTP 429 / 5xx]                      [HTTP 200 OK]
                    │                                     │
           [Circuit Breaker Trip]                 [Parse & Filter]
                    │                                     │
                    ▼                              ┌──────┴──────┐
        ┌───────────────────────┐                  ▼             ▼
        │ Switch to T2 Globally │            [Candidates > 0] [0 Matches]
        └───────────┬───────────┘                  │             │
                    │                              ▼             ▼
                    │                         [Gemini Pick]   [T2 Openverse]
                    │                              │                 │
                    │                   ┌──────────┴──────────┐      │
                    │                   ▼                     ▼      │
                    │            [Confidence High]    [Low / Reject] │
                    │                   │                     │      │
                    │                   ▼                     └──────┼──┐
                    │            [Download & Log]                    │  │
                    │                                                │  │
                    └────────────────────────────────────────────────┘  │
                                                                        ▼
                                                             ┌─────────────────────┐
                                                             │ Search Openverse T2 │
                                                             └──────────┬──────────┘
                                                                        │
                                                         ┌──────────────┴──────────────┐
                                                         ▼                             ▼
                                                  [T2 Match Found]              [T2 Zero Matches]
                                                         │                             │
                                                         ▼                             ▼
                                                  [Download & Log]              [T3 AI Synthesis]
                                                                                       │
                                                                                       ▼
                                                                                [Generate & Tag]
```

1. **Wikimedia 429 Prevention:**
   * Global pace node enforces a minimum 3.0-second delay between Commons requests.
   * If an HTTP 429 is encountered, n8n executes a 30-second backoff. If a second 429 occurs, the workflow trips a circuit breaker and automatically switches all subsequent slides in the run directly to Tier 2 (Openverse), bypassing Wikimedia to prevent long-term IP blacklisting.
2. **Openverse Quota Management:**
   * Uses OAuth2 authenticated requests granting 5,000 requests/day.
   * Search requests are throttled with a 1.5-second pacing delay.
3. **Deterministic Immutability:**
   * Every downloaded image must pass the binary header validation (`FF D8` for JPEG, `89 50` for PNG) and size threshold (>10 KB) before file save and Airtable attachment.
   * If an asset fails validation, the error is appended to `Reviewer Notes` and `Flags`, and the pipeline gracefully falls back to the next tier without crashing the n8n execution.
