# WE, HUMANITY – System Handover & Architecture Document

**Series:** WE, HUMANITY (`@by.wehumanity`)  
**Editorial Pillar:** Form and Function (Human ingenuity, industrial design, architecture, craft)  
**Repository:** [github.com/samuelliam/we-humanity](https://github.com/samuelliam/we-humanity) (`main`)  
**Live Hosting:** [https://bywehumanity.web.app](https://bywehumanity.web.app)  
**Firebase Project:** `bywehumanity` (`bywehumanity.firebasestorage.app`)  
**Date:** November 18, 2026  

---

## 1. System Architecture & Port Map

| Component | Port / URL | Description | Key Files |
|---|---|---|---|
| **WE, HUMANITY Studio** | `http://127.0.0.1:5695` | Local web GUI to preview, review, trigger n8n, approve, publish to IG, send to TikTok, export Google Flow Reels, and restyle. | `app/server.js`, `app/public/` |
| **Chromium Render Server** | `http://127.0.0.1:5690` | Headless Playwright/Puppeteer server converting SVG carousel slides into crisp `1080×1350` PNGs. | `scripts/render-server.js` |
| **n8n Automation Engine** | `http://127.0.0.1:5678` | Pipeline orchestrator (`WF1` Research → `WF2` Draft → `WF3c` Image Finding → `WF4` Slide SVG Rendering). | `n8n/*.json` |
| **Firebase Hosting** | `https://bywehumanity.web.app` | Public HTTPS hosting for Terms, Privacy, TikTok domain verification files, and OAuth callback relay. | `hosting/`, `firebase.json` |
| **Firebase Storage** | `bywehumanity.firebasestorage.app` | Temporary secure asset bridge for Instagram & TikTok Graph API image ingestion (auto-cleaned after publish). | `scripts/instagram-publisher.js`, `scripts/tiktok-publisher.js` |

---

## 2. Credentials & Environment (`.env`)

> [!IMPORTANT]
> The `.env`, `firebase-service-account.json`, `.tiktok-token.json`, and `.studio-*.json` files are **strictly gitignored** and must never be committed.

### `.env` Structure:
```env
# Instagram Graph API (@by.wehumanity)
IG_USER_ID=17841414022297284
IG_ACCESS_TOKEN=<long-lived-meta-token>

# Firebase Storage (project: bywehumanity)
FIREBASE_STORAGE_BUCKET=bywehumanity.firebasestorage.app
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

# TikTok API & Login Kit
TIKTOK_CLIENT_KEY=awlx6qsv1ckisw42
TIKTOK_CLIENT_SECRET=VDSFXS7fX2S9DXTCgN0MK556kcclqjuh
TIKTOK_REDIRECT_URI=https://bywehumanity.web.app/callback.html
TIKTOK_POST_MODE=MEDIA_UPLOAD
```

---

## 3. TikTok Developer Setup & Fixes

### A. The "localhost is not supported" Error
TikTok strictly forbids `http://localhost` and `http://127.0.0.1` for Web Apps.  
**Solution Implemented:**
- Created and deployed `hosting/callback.html` to Firebase Hosting:
  `https://bywehumanity.web.app/callback.html`
- When TikTok completes authorization, it redirects to this HTTPS page, which automatically forwards the auth code to `http://127.0.0.1:5695/api/tiktok/callback` on the local machine.
- Configured `TIKTOK_REDIRECT_URI=https://bywehumanity.web.app/callback.html` in `.env`.

### B. What to Enter in TikTok Developer Portal
1. **Redirect URI:**
   ```text
   https://bywehumanity.web.app/callback.html
   ```
2. **Terms of Service URL:**
   ```text
   https://bywehumanity.web.app/terms.html
   ```
3. **Privacy Policy URL:**
   ```text
   https://bywehumanity.web.app/privacy.html
   ```
4. **Domain Verification:**
   - The file `tiktokhvq343olAGE0bK8yV9Q14YEvnNsH1cRb.txt` (and prior verification files) are deployed and return `HTTP 200 OK` on both direct and trailing-slash paths.
5. **Sandbox Target Users:**
   - Under **Sandbox → Target Users** (or App Testers), add the creator's TikTok handle so TikTok permits authorization before public app review.

---

## 4. Operational Runbook

### Starting Background Services
```bash
# 1. Start n8n
n8n start

# 2. Start Headless Render Server (Port 5690)
node scripts/render-server.js

# 3. Start Studio Web GUI (Port 5695)
node app/server.js
```

### Deploying Hosting Updates
Whenever verification files or legal pages change:
```bash
firebase deploy --only hosting
```

### Instagram & TikTok Publishing Flow
1. **Generate Carousel:** From Studio (`http://127.0.0.1:5695`), click **Generate Story & Carousel** or trigger via n8n.
2. **Review in Studio:** Preview all slides (asserts 0 overlaps, `archival-warm` palette, `Georgia` serif typography, `@by.wehumanity` branding).
3. **Publish to Instagram:** Click **Publish to IG**. Uploads slides to Firebase Storage, calls Meta Graph API container endpoint, checks status, publishes carousel, records permalink in `renders/<storyId>.meta.json`, and deletes temporary Storage objects.
4. **Send to TikTok:** Click **Send to TikTok**. Connects via OAuth, uploads slides, calls `/v2/post/publish/content/init/` (`MEDIA_UPLOAD`), and sends carousel directly to the creator's TikTok inbox as an editable draft.
