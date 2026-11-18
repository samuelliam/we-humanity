# AI Progress Handover – WE, HUMANITY Publishing Pipeline

**Document Purpose:** Complete state, progress, and context briefing for incoming AI agents picking up the WE, HUMANITY automation pipeline.  
**Date:** November 18, 2026  
**Repository:** [github.com/samuelliam/we-humanity](https://github.com/samuelliam/we-humanity) (`main`)  
**Target Brand:** WE, HUMANITY (`@by.wehumanity`) – Instagram & TikTok  
**Editorial Pillar:** "Form and Function" (Human ingenuity, architecture, industrial craft)  

---

## 1. Project Overview & Target Architecture

WE, HUMANITY is an independent editorial publishing pipeline celebrating human ingenuity. The system automates the research, writing, graphic generation, and cross-platform publishing of multi-slide carousels (`1080×1350`) and short-form video reels.

### Core Ecosystem Components:
```
+---------------------------------------------------------------------------------+
|                                WE, HUMANITY STUDIO                              |
|                          http://127.0.0.1:5695 (Node.js)                        |
|   - Review & approve story drafts                                               |
|   - Visual slide carousel preview with 0-overlap validation                     |
|   - 1-Click Publish to Instagram (Meta Graph API via Firebase Storage)           |
|   - 1-Click Send to TikTok (OAuth2 PKCE -> Photo Carousel Inbox Drafts)         |
|   - Google Flow Reel prompt generator (3-step scene copy)                       |
+----------------------------------------+----------------------------------------+
                                         |
         +-------------------------------+-------------------------------+
         |                               |                               |
         v                               v                               v
+------------------+           +------------------+           +------------------+
|  n8n Workflows   |           | Headless Render  |           | Firebase Cloud   |
|  Port: 5678      |           | Server: 5690     |           | bywehumanity     |
|  - WF1: Research |           | - Playwright SVG |           | - Hosting: web   |
|  - WF2: Draft    |           |   to 1080x1350   |           | - Storage: temp  |
|  - WF3c: Images  |           |   PNG slides     |           |   signed URLs    |
|  - WF4: Publish  |           +------------------+           +------------------+
+------------------+
```

---

## 2. Chronological Progress & Completed Milestones

### Phase 1: Brand Identity & Visual Design (Completed)
- **Brand Monogram Logo:** Built 1:1 `900×900` PNG at `assets/we-humanity-profile-logo.png` (warm ivory `#F6F4EF` serif monogram with drafting arc on dark charcoal `#171715`).
- **Typography & Aesthetics:** Locked carousels to `archival-warm` palette (`#171715`, `#F6F4EF`, `#E8E4DA`, `#C2A675`), `Georgia` serif headlines, and explicit series branding (`FORM & FUNCTION #07 · WE, HUMANITY` on cover; `FORM & FUNCTION #07` on body slides).
- **Layout Overlap Elimination:** Designed and enforced 2D bounding-box collision detection (`checkSvgOverlaps`) inside `n8n/WF4-social-carousel-publish.json`. All 7 carousel layouts render with 0 text/image collisions. Body text is enlarged to `36–38px` (`48–54px` line-height) and limited to `16–24` words/slide for mobile readability.

### Phase 2: Instagram Graph API Integration (Completed & Operational)
- **Firebase Storage Bridge:** Implemented in `scripts/instagram-publisher.js`. Slides are uploaded with signed Google Cloud access tokens to `bywehumanity.firebasestorage.app`.
- **Carousel Publishing:** Sequentially creates Meta container items, checks status until `FINISHED`, creates carousel container, and executes `media_publish`.
- **Auto-Cleanup:** Deletes temporary Firebase Storage objects and local `assets/<storyId>_slide_*` staging files after successful publication.
- **Story Metadata:** Persisted in `renders/<storyId>.meta.json` with Instagram permalinks.

### Phase 3: Studio Web Application (Completed & Operational)
- **Local Dashboard:** Located in `app/server.js`, `app/public/index.html`, `app/public/app.js`.
- **Controls:** "Approve", "Publish to IG" (with live progress indicator), "Re-style Carousel" (targets `.studio-rerender.json` for WF4-only rapid re-renders), "Delete" (safely cleans `renders/` and `assets/`), and "Download .zip".
- **Google Flow Reel Generator:** Generates 4-scene `9:16` video prompts formatted to comply with Google Flow's content filters (abstracting named historical figures into artifacts/hands, max 17 words/scene for natural speech cadence). Includes "Copy Scene" and "Copy All Scenes" buttons.
- **IG Music Recommendations:** Curated historical/editorial classical music recommendations with 1-click copy buttons.

### Phase 4: TikTok API & Login Kit Integration (Currently In-Flight)
- **TikTok Publisher:** Built in `scripts/tiktok-publisher.js`. Handles OAuth 2.0 PKCE (`code_challenge` + `code_verifier` S256), token refresh, and `/v2/post/publish/content/init/` for Photo Carousels (`MEDIA_UPLOAD` mode sending directly to creator app Inbox Drafts).
- **OAuth Callback Relay:** Because TikTok Web Apps reject `http://localhost` and `http://127.0.0.1`, created and deployed `hosting/callback.html` to Firebase Hosting (`https://bywehumanity.web.app/callback.html`). This relays incoming auth codes to the local Studio on port 5695.
- **Domain Verification:** Deployed Terms of Service (`terms.html`), Privacy Policy (`privacy.html`), and all TikTok verification challenge files (`tiktokhvq343olAGE0bK8yV9Q14YEvnNsH1cRb.txt`, etc.) to Firebase Hosting with trailing-slash rewrite rules in `firebase.json`. All return `HTTP 200 OK`.

---

## 3. Current In-Flight State & Immediate Next Steps

### The Current Blocker & Exact Resolution:
The user was setting up their TikTok Developer App and encountered two errors:
1. `Verify URL prefix` / `This URL is not verified`
   - *Status:* **RESOLVED.** Verification file `tiktokhvq343olAGE0bK8yV9Q14YEvnNsH1cRb.txt` and rewrites are deployed on `https://bywehumanity.web.app`.
2. `Redirect Uri: Enter a valid redirect uri (localhost is not supported)`
   - *Status:* **RESOLVED IN REPO, PENDING USER SAVE IN PORTAL.**
   - In TikTok Developer Portal, TikTok rejects `http://127.0.0.1:5695/api/tiktok/callback`.
   - The user must enter the live relay URL: `https://bywehumanity.web.app/callback.html`.
   - `.env` already has `TIKTOK_REDIRECT_URI=https://bywehumanity.web.app/callback.html`.

### Step-by-Step Actions Needed by Next Agent / User:
1. **In TikTok Developer Portal (`developers.tiktok.com`):**
   - **Click "Verify":** Verify the property `https://bywehumanity.web.app/`.
   - **Set Terms of Service URL:** `https://bywehumanity.web.app/terms.html`
   - **Set Privacy Policy URL:** `https://bywehumanity.web.app/privacy.html`
   - **Set Redirect URI** *(under Login Kit → Settings → Redirect URI)*:
     `https://bywehumanity.web.app/callback.html`
   - **Add Target Users** *(under Sandbox / App Testers)*: Add the creator's TikTok username so TikTok permits test authorizations before app review.
   - **Save Changes.**
2. **Authorize via Studio:**
   - In Studio (`http://127.0.0.1:5695`), click **Connect TikTok**.
   - The browser opens TikTok authorization, redirects to `bywehumanity.web.app/callback.html`, and bounces back to `http://127.0.0.1:5695/api/tiktok/callback`.
   - The Studio will exchange the code, save `.tiktok-token.json`, and header will display **TikTok ✓**.
3. **Test "Send to TikTok":**
   - Click **Send to TikTok** on an existing story (e.g. `recpQyJ89s3pVz5ou`).
   - Confirm the carousel arrives in the creator's TikTok inbox as an editable draft.

---

## 4. Key Constraints & Technical Rules (Do Not Violate)

1. **Strict Git Sanitization:**
   - Never commit `.env`, `firebase-service-account.json`, `.tiktok-token.json`, or `.studio-*.json`.
   - On macOS, `/Users/admin/.gitignore_global` contains `App`, which ignores `app/`. To stage files inside `app/`, always use `git add -f app/<file>`.
2. **Instagram Audio Limitation:**
   - Meta Graph API cannot attach native Instagram Music Library tracks programmatically. Carousels must either publish silent via API (copying music recommendations) or be exported via `.zip` for manual mobile upload.
3. **Google Flow (Veo 3) Policy Rules:**
   - Prompts must not name specific historical figures (triggers prominent-person safety filters). Frame prompts around artifacts, architecture, drafting tables, and hands. Narration must be $\le 17$ words per 8s clip.
4. **SVG Overlap Checker Safety:**
   - Never run regex collision checks directly on SVGs containing large base64 image strings. Strip `href="data:[^"]*"` first to avoid regex catastrophic backtracking / process lockup.

---

## 5. File Inventory & Important Paths

- `app/server.js`: Studio HTTP server, API endpoints, TikTok OAuth handlers.
- `app/public/`: Studio frontend (`index.html`, `app.js`, `styles.css`).
- `scripts/instagram-publisher.js`: Firebase Storage uploader & Instagram Graph API publisher.
- `scripts/tiktok-publisher.js`: TikTok OAuth PKCE exchange, token refresh, and `/v2/post/publish/` carousel logic.
- `scripts/render-server.js`: Headless browser SVG-to-PNG renderer (port 5690).
- `hosting/`: Firebase Hosting static files (`terms.html`, `privacy.html`, `callback.html`, TikTok verification files).
- `firebase.json`: Firebase Hosting rewrite rules and headers.
- `docs/WE-HUMANITY.md`: Complete editorial guidelines, design rules, and tone of voice.
- `docs/HANDOVER.md`: System handover reference.
