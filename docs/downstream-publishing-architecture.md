# WF3 Downstream Architecture Design: Social Carousel Formatting & Automated Multi-Platform Publishing

**Document Version:** 1.0.0  
**Project:** WE, HUMANITY  
**Date:** 2026-11-13  
**Status:** Architecture Specification  

---

## 1. System Vision & Architectural Scope

The **WE, HUMANITY** social publishing engine transforms research-backed, verified stories and licensed visual assets into high-craftsmanship social carousels across three primary publishing destinations:
1. **LinkedIn:** Document Carousel (Swipeable PDF) and multi-image posts.
2. **Instagram:** Feed Carousel (1080 $\times$ 1350 px, 4:5 portrait ratio, 6 slides).
3. **X / Twitter:** Multi-image Thread (Post 1: Slides 1–4; Post 2 / Reply: Slides 5–6).

This architecture bridges the upstream research pipelines (WF2 Draft Story, WF3c Research Slide Images) and live audience distribution. It enforces **strict editorial and human approval gates**, deterministic typography and visual branding overlay, multi-format rendering, and idempotent API publishing.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           UPSTREAM AIRTABLE DATABASE                            │
│  Stories Table (tblPgv6MsUEMNnvCn)    Assets Table (tbl8HCdgugwL3SZjy)          │
│  - Title, Pillar, Glance, Explore     - Slide Index (1-6), Type ('image')       │
│  - Deep Dive, Remember                - Sourced Image Binary / URL              │
│  - Status = 'Images Approved'         - Credit String, License, AI Generated    │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                                       ▼ [Trigger: Status = 'Images Approved']
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      SLIDE RENDERING & COMPOSITION ENGINE                       │
│  - Ingests Story Copy + 6 Sourced Assets                                        │
│  - Preprocesses imagery (sharp: smart cropping, noise reduction, aspect ratio)  │
│  - Overlays typography & brand system (Satori + @resvg/resvg-js / Puppeteer)    │
│  - Generates 6 high-resolution slide PNGs (1080 x 1350 px)                      │
│  - Assembles LinkedIn Document Carousel (pdf-lib: vector PDF with metadata)     │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          HUMAN REVIEW & APPROVAL GATE                           │
│  - Renders uploaded to Airtable 'Carousel PDF' & 'Carousel Slides'              │
│  - Story Status transitions to 'Carousel Review Pending'                        │
│  - Interactive Slack / Discord Notification sent with preview gallery & actions │
│  - Human Editor inspects visual alignment, typography, and attribution          │
│  - Action: Editor clicks [Approve & Publish] or [Request Edits]                 │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                                       ▼ [Webhook: Status = 'Publishing Approved']
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      MULTI-PLATFORM PUBLISHING CONTROLLER                       │
│  ├── LinkedIn Publisher Node (Document Post API: urn:li:document:...)          │
│  ├── Instagram Publisher Node (Graph API: Container -> Carousel -> Publish)    │
│  └── X / Twitter Publisher Node (API v1.1 Media Upload -> v2 Thread Tweets)     │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           POST-PUBLISHING AUDIT & LOG                           │
│  - Record Live URLs (LinkedIn URL, Instagram URL, X URL) in Airtable            │
│  - Transition Story Status to 'Published'                                       │
│  - Dispatch Final Broadcast Notification to Slack / Discord                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Ingestion & Data Contract

### 2.1 Upstream Airtable Preconditions
The downstream pipeline is triggered only when a Story record in `tblPgv6MsUEMNnvCn` satisfies the strict verification gate:
1. `Status` $=$ `'Images Approved'` (explicitly transitioned by the human editor after reviewing Section A checklist and image candidates).
2. Exactly 6 linked records exist in `Assets` (`tbl8HCdgugwL3SZjy`).
3. Linked `Assets` records span `Slide Index` 1 through 6 with no gaps or duplicates.
4. Each Asset has an attached file binary (`fldGdVdkR0bzAWKOr`), valid `License`, and non-empty `Credit`.

### 2.2 Story Content Mapping to 6 Slides

| Slide Index | Slide Role | Text Content Source | Visual Role | Layout & Hierarchy |
|---|---|---|---|---|
| **Slide 1** | **Cover** | `Stories.Title`<br>`Stories.Pillar` | Hero Visual (Key object / portrait) | Bold headline, category pill tag, series branding (`WE, HUMANITY`), swipe prompt indicator. |
| **Slide 2** | **Glance** | `Stories.Glance` | Context Visual (Object in use / environment) | Punchy breakthrough statement, high-contrast typography over darkened scrim. |
| **Slide 3** | **Explore** | `Stories.Explore` | Historical Visual (Archive photo / blueprint / creator) | Historical narrative context, date badge, secondary callout block. |
| **Slide 4** | **Deep Dive 1** | `Stories.Deep Dive` (Part 1 / Mechanism) | Detail Visual (Component closeup / mechanism) | Technical / craftsmanship focus, design principle callout. |
| **Slide 5** | **Deep Dive 2** | `Stories.Deep Dive` (Part 2 / Impact) | Impact Visual (Cultural resonance / finished form) | Modern relevance, philosophy synthesis, material notes. |
| **Slide 6** | **Remember** | `Stories.Remember` | Reflection Visual (Enduring symbol / minimalism) | Core moral/human takeaway, quote styling, series watermark, follow/save prompt. |

---

## 3. Image Processing & Canvas Rendering Engine

### 3.1 Technology Evaluation & Selection

To generate high-resolution carousels at scale, three rendering paradigms were evaluated:

| Engine | Pros | Cons | Recommendation |
|---|---|---|---|
| **Satori + Sharp + Resvg** *(JSX/HTML $\to$ SVG $\to$ PNG)* | • 15–30 ms per slide render speed.<br>• Minimal memory footprint.<br>• Native Flexbox support.<br>• Sharp provides C-level resizing & color grading. | • Canvas/SVG filters are limited compared to a full browser.<br>• Cannot generate multi-page PDF directly (requires `pdf-lib`). | **Primary Engine for Slide PNGs.** Ideal for high-throughput headless workflows. |
| **Puppeteer / Playwright** *(Headless Chrome)* | • 100% full CSS/HTML/WebFont fidelity.<br>• Direct `page.pdf()` multi-page export for LinkedIn.<br>• Exact backdrop-filter / frosted glass rendering. | • Heavier RAM usage (~250MB per browser instance).<br>• Slower startup time (1.2–2.5 s per job). | **Primary Engine for LinkedIn PDF Generation & High-Fidelity Previews.** |
| **Node-Canvas (Cairo)** | • Mature 2D canvas API. | • Imperative rendering (no CSS/HTML layout).<br>• Complex text-wrapping math.<br>• Prone to font rendering inconsistencies. | **Rejected.** Unsuitable for modern editorial design typography. |

### 3.2 Chosen Rendering Pipeline Architecture
A **hybrid microservice pattern** is adopted:
1. **Asset Optimization (via `sharp`):**
   * Raw image is downscaled or cropped to 1080 $\times$ 1350 px (4:5 portrait ratio) using smart focal-point entropy crop.
   * Image passes through a subtle grading pass: warmth $+3\%$, subtle vignette, and a directional gradient scrim (bottom 40% darkened) to ensure text legibility without obscuring the artefact.
2. **Typography & Layout Composition (via `Satori` + `@resvg/resvg-js` or `Puppeteer`):**
   * Renders the editorial design layer on top of the graded photograph.
3. **Document Assembly (via `pdf-lib`):**
   * Stitches the 6 generated 1080 $\times$ 1350 PNG slides into a single, compact, vector-text PDF document optimized for LinkedIn carousels.

---

## 4. Visual Design System & Branding Specifications

To honor the project's identity—reverent, timeless human craftsmanship—the rendering engine applies strict design system rules:

```
┌──────────────────────────────────────────────────────────────┐
│ [WE, HUMANITY]                             [DESIGN & CRAFT] │ ◄── 80px Top Safe Zone
│                                                              │
│                                                              │
│                                                              │
│                   HERO PHOTOGRAPH / ARTEFACT                 │
│                 (Subtle vignette, sharp crop)                │
│                                                              │
│                                                              │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ "Good design is as little design as possible."           │ │ ◄── Glass Scrim Card
│ │                                                          │ │     (Blur 20px, 60% Black)
│ │ Dieter Rams stripped the Braun SK4 of all ornamental     │ │
│ │ timber, leaving only pure acoustic function.             │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ 03 / 06                    "Braun SK4" by Jane Doe (CC BY-SA)│ ◄── 60px Bottom Bar
└──────────────────────────────────────────────────────────────┘
  ▲ 1080 px                                             1350 px ▲
```

### 4.1 Typography Standards
* **Display / Header Serif:** *Fraunces* or *Playfair Display* (700 Bold / Optical Size 72). Used for Titles, Quotes, and Key Revelations.
* **Body / Technical Sans-Serif:** *Inter* or *Univers / Helvetica Neue* (400 Regular and 500 Medium). High legibility at small sizes on mobile devices.
* **Monospace / Micro-labels:** *JetBrains Mono* (500 Medium, uppercase, letter-spacing $+1.5\text{px}$). Used for slide counters (`03 / 06`), category tags (`PILLAR: INDUSTRIAL DESIGN`), and attribution lines.

### 4.2 Legal Credit & Attribution Overlay
Per the strict legal requirements of CC BY, CC BY-SA, and public domain licenses:
* Every slide featuring an external asset displays a persistent, subtle micro-credit overlay along the bottom right margin:
  ```text
  "Title" by Artist via Commons (CC BY-SA 4.0)
  ```
* Font size: 18 px (on 1080 $\times$ 1350 canvas), color: `#E0E0E0` with a subtle drop shadow (`drop-shadow(0 1px 2px rgba(0,0,0,0.8))`), ensuring compliance without competing with editorial copy.
* For AI-generated slides (Tier 3 fallback):
  ```text
  Visual synthesis via Imagen 3 (WE, HUMANITY Archive Reconstruction)
  ```

---

## 5. Multi-Platform Social Publishing Node Specifications

### 5.1 Platform A: LinkedIn (Document Carousel & Multi-Image)

LinkedIn document carousels achieve 3–5$\times$ the organic click-through rate of standard link posts.

#### API Pipeline: LinkedIn Community Management API v2
1. **Initialize Document Upload:**
   * `POST https://api.linkedin.com/rest/documents?action=initializeUpload`
   * Request Payload:
     ```json
     {
       "initializeUploadRequest": {
         "owner": "urn:li:organization:{{ $env.LINKEDIN_ORG_ID }}"
       }
     }
     ```
   * Extracts `uploadUrl` and `document` URN (`urn:li:document:...`).
2. **Upload PDF Binary:**
   * `PUT {{ $json.uploadUrl }}`
   * Headers: `Content-Type: application/pdf`
   * Body: Binary buffer of assembled 6-page PDF.
3. **Publish Document Post:**
   * `POST https://api.linkedin.com/rest/posts`
   * Headers: `LinkedIn-Version: 202401`, `X-Restli-Protocol-Version: 2.0.0`
   * Request Payload:
     ```json
     {
       "author": "urn:li:organization:{{ $env.LINKEDIN_ORG_ID }}",
       "commentary": "{{ $json.linkedin_caption }}",
       "visibility": "PUBLIC",
       "distribution": {
         "feedDistribution": "MAIN_FEED",
         "targetEntities": [],
         "thirdPartyDistributionChannels": []
       },
       "content": {
         "document": {
           "title": "{{ $json.story_title }} — WE, HUMANITY",
           "source": "{{ $json.document_urn }}"
         }
       },
       "lifecycleState": "PUBLISHED",
       "isReshareDisabledByAuthor": false
     }
     ```

---

### 5.2 Platform B: Instagram Feed Carousel (Graph API)

Instagram requires an asynchronous containerized publishing sequence for multi-item carousels.

#### API Pipeline: Instagram Graph API (v19.0+)
1. **Step 1: Create Item Containers (for Slide 1 through 6):**
   * Executed in a loop or parallel batch:
   * `POST https://graph.facebook.com/v19.0/{{ $env.IG_USER_ID }}/media`
   * Parameters:
     * `image_url`: Publicly accessible HTTPS URL of slide PNG (hosted via secure signed S3/Airtable attachment URL).
     * `is_carousel_item`: `true`
   * Output: `container_id_1`, `container_id_2`, ..., `container_id_6`.
2. **Step 2: Poll Container Status:**
   * Poll `GET https://graph.facebook.com/v19.0/{container_id}?fields=status_code` until status is `FINISHED` (exponential backoff: 2s, 4s, 8s).
3. **Step 3: Create Parent Carousel Container:**
   * `POST https://graph.facebook.com/v19.0/{{ $env.IG_USER_ID }}/media`
   * Parameters:
     * `media_type`: `CAROUSEL`
     * `children`: Comma-separated array of item container IDs: `container_id_1,container_id_2,...,container_id_6`
     * `caption`: Formatted Instagram caption with editorial story text, credit acknowledgments, and series hashtags (`#WeHumanity #DieterRams #IndustrialDesign #Craftsmanship`).
   * Output: `parent_carousel_container_id`.
4. **Step 4: Publish Carousel Container:**
   * `POST https://graph.facebook.com/v19.0/{{ $env.IG_USER_ID }}/media_publish`
   * Parameters:
     * `creation_id`: `{{ $json.parent_carousel_container_id }}`
   * Output: Live post ID (`id`).

---

### 5.3 Platform C: X / Twitter Multi-Image Thread

Twitter v2 API limits media attachments to **4 images per single tweet**. Therefore, a 6-slide story is natively formatted as a **2-part high-engagement thread**:
* **Tweet 1 (Hook & Setup):** Slides 1, 2, 3, 4 attached.
* **Tweet 2 (Deep Dive & Climax / Reply):** Slides 5 and 6 attached, posted in reply to Tweet 1.

#### API Pipeline: Twitter Media Upload v1.1 + Tweets v2
1. **Step 1: Chunked Media Upload (for each of the 6 slide images):**
   * `POST https://upload.twitter.com/1.1/media/upload.json`
   * Commands: `INIT` (specifying `total_bytes`, `media_type: image/png`), `APPEND` (uploading chunked binary buffer), `FINALIZE`.
   * Sets Media Metadata (`POST media/metadata/create`) with accessible alt text describing the historical object and slide copy.
   * Outputs: `[media_id_1, media_id_2, media_id_3, media_id_4, media_id_5, media_id_6]`.
2. **Step 2: Create Root Tweet (Post 1):**
   * `POST https://api.twitter.com/2/tweets`
   * Request Payload:
     ```json
     {
       "text": "1/2 — {{ $json.tweet_hook }}\n\n(A 6-slide visual story on human creativity and craftsmanship 🧵)",
       "media": {
         "media_ids": ["{{ media_id_1 }}", "{{ media_id_2 }}", "{{ media_id_3 }}", "{{ media_id_4 }}"]
       }
     }
     ```
   * Output: `root_tweet_id`.
3. **Step 3: Create Thread Reply Tweet (Post 2):**
   * `POST https://api.twitter.com/2/tweets`
   * Request Payload:
     ```json
     {
       "text": "2/2 — {{ $json.tweet_conclusion }}\n\nRemember: {{ $json.remember_line }}\n\nFollow @WeHumanity for daily studies in human design excellence.",
       "reply": {
         "in_reply_to_tweet_id": "{{ $json.root_tweet_id }}"
       },
       "media": {
         "media_ids": ["{{ media_id_5 }}", "{{ media_id_6 }}"]
       }
     }
     ```
   * Output: `reply_tweet_id`.

---

## 6. Human-in-the-Loop Approval Gates & Notification Webhooks

Automation never publishes directly without human verification. The publishing workflow enforces an immutable multi-stage approval gate:

```
                  ┌───────────────────────────────┐
                  │    Stories: Status Becomes    │
                  │       'Images Approved'       │
                  └──────────────┬────────────────┘
                                 │
                                 ▼
                  ┌───────────────────────────────┐
                  │   n8n Downstream Generator    │
                  │   - Renders 6 Slide PNGs      │
                  │   - Assembles Carousel PDF    │
                  │   - Formats Social Captions   │
                  └──────────────┬────────────────┘
                                 │
                                 ▼
                  ┌───────────────────────────────┐
                  │  Airtable Staging Updates     │
                  │  - Attach PDF & Slide PNGs    │
                  │  - Status: 'Review Pending'   │
                  └──────────────┬────────────────┘
                                 │
                                 ▼
                  ┌───────────────────────────────┐
                  │   Slack / Discord Dispatch    │
                  │   - Carousel preview gallery  │
                  │   - Interactive buttons:      │
                  │     [Approve for All]         │
                  │     [Approve Selected]        │
                  │     [Reject / Request Edits]  │
                  └──────────────┬────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                ▼                                 ▼
     [Human Clicks "Approve"]          [Human Clicks "Reject"]
                │                                 │
                ▼                                 ▼
  ┌───────────────────────────┐     ┌───────────────────────────┐
  │ n8n Webhook Endpoint      │     │ n8n Webhook Endpoint      │
  │ - Sets Status: 'Approved' │     │ - Sets Status: 'Rejected' │
  │ - Triggers API Publishing │     │ - Logs Editor Feedback    │
  └─────────────┬─────────────┘     └───────────────────────────┘
                │
                ▼
  ┌───────────────────────────┐
  │ Published Across          │
  │ LinkedIn, Instagram, X    │
  └───────────────────────────┘
```

### 6.1 Interactive Notification Payload (Slack Block Kit)
Upon rendering the social previews, n8n issues an interactive message to `#we-humanity-editorial`:

```json
{
  "channel": "#we-humanity-editorial",
  "text": "New Carousel Ready for Review: Dieter Rams — Ten Principles of Good Design",
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "🎨 Social Carousel Ready for Review" }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Story:* Dieter Rams — Ten Principles of Good Design\n*Pillar:* Industrial Design & Craft\n*Assets:* 6 verified images (5 Wikimedia Commons, 1 Openverse)\n*Carousel PDF:* <{{ $json.pdf_download_url }}|Download Preview PDF>"
      }
    },
    {
      "type": "image",
      "image_url": "{{ $json.slide_1_preview_url }}",
      "alt_text": "Slide 1 Cover Preview"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "🚀 Approve & Publish (All Platforms)" },
          "style": "primary",
          "value": "publish_all_{{ $json.story_id }}",
          "url": "https://n8n.wehumanity.internal/webhook/carousel-publish?action=approve&id={{ $json.story_id }}&auth={{ $json.hmac_token }}"
        },
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "✏️ Request Re-Render / Edits" },
          "style": "danger",
          "value": "reject_{{ $json.story_id }}",
          "url": "https://n8n.wehumanity.internal/webhook/carousel-publish?action=reject&id={{ $json.story_id }}&auth={{ $json.hmac_token }}"
        }
      ]
    }
  ]
}
```

---

## 7. Error Handling, Retries & Safe Degradation

1. **Idempotency & Re-publishing Locks:**
   * Every publishing execution verifies that `Stories.Published Platforms` does not already contain the destination platform key.
   * If LinkedIn succeeds but Instagram fails with a 500 error, Airtable records `Published Platforms = ['LinkedIn']`. On retry, LinkedIn publishing is bypassed, preventing embarrassing duplicate posts.
2. **Media Host URL Expiration Protection:**
   * Instagram and Twitter require external media URLs during ingestion. Instead of temporary pre-signed S3 links that expire in 15 minutes, media is served through a persistent internal CDN proxy endpoint or verified Airtable static attachment URL.
3. **Failure Isolation:**
   * Platform nodes run in parallel branches with independent `Catch` nodes. Failure on Twitter (e.g. rate limit) does not abort LinkedIn or Instagram publication.
   * All failures trigger an immediate priority alert in `#we-humanity-alerts` with the exact HTTP error code and payload.
