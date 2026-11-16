# Workflow Audit Report: Live n8n Workflow vs Repository & Specification

**Date**: 2026-11-13  
**Workflow Audited**: `WH - WF3c Research Slide Images` (ID: `Bnv0SFCD8oerXXhs`)  
**Auditor**: Explorer Subagent (`explorer_1`)  
**Integrity Mode**: Read-Only Audit  

---

## Executive Summary

A comprehensive read-only audit was conducted on the live n8n workflow `WH - WF3c Research Slide Images` (ID `Bnv0SFCD8oerXXhs`), comparing it against the repository workflow export `n8n/WF3c-research-slide-images.json`, historical versions (`n8n/WF3c-research-slide-images.pre-2026-11-11-edits.json` and `WH - WF3c Research Slide Images.json`), and the architectural specification `WF3c-SPEC.md`.

### Core Findings
1. **Bit-for-Bit Identity with Repository Canonical**: The live workflow in local SQLite (`~/.n8n/database.sqlite`) is 100% identical in all 34 nodes, connections, parameters, and metadata to `n8n/WF3c-research-slide-images.json`.
2. **Resolution of Handoff Question**: The discrepancy noted in `WF3c Handoff - 11 November 2026.md` (where live was suspected to differ from the export regarding `waitBetweenTries` and `gsrlimit`) was resolved: the older pre-edit file had `waitBetweenTries: 10000` and `gsrlimit=5`, but the current canonical file and the live database both have `waitBetweenTries: 5000` and `gsrlimit=20`.
3. **Safety & Keep-Out Rules Strictly Respected**:
   - Neither `Approved` nor `Status` is ever set, modified, or written by any of the 34 nodes.
   - The workflow is currently inactive (`active: 0`), triggered only manually.
   - The two write/upload nodes (`Create Asset` and `Upload Saved Asset File`) are explicitly deactivated (`disabled: true`).
4. **Key Parameter Highlights**:
   - `Commons Search`: `gsrlimit=20`, `retryOnFail: true`, `maxTries: 3`, `waitBetweenTries: 5000` ms, timeout 5000 ms, query appends `+ ' filetype:bitmap'`. Pacing node `Pace Commons Searches` has `amount: 1` (1 second).
   - `Plan Slides`: Node type `@n8n/n8n-nodes-langchain.googleGemini` v1.1, model `models/gemini-3.8-flash`, `jsonOutput: true`, temperature default (omitted), no node-level system prompt (user prompt dynamic string from `Build Planning Prompt`), schema enforced by prompt instructions and validated by `Validate Plan`.
   - `Build Assets Record`: Maps 13 Airtable fields; maps `Slide Type` from spec values to Airtable allowed options (`object` -> `context`, `person` -> `people`, `detail` -> `process`); uses raw licence `c.licenceRaw` instead of normalized; outputs `attachmentUpload` payload for two-step upload via `Upload Saved Asset File`.

---

## 1. Live Environment & Extraction Methodology

### 1.1 Process & Database State
- **Process Status**: n8n is running locally under Node.js:
  - Command: `node n8n start` (PID: `26073`)
  - Task Runner: `node .../@n8n/task-runner/dist/start.js` (PID: `26108`)
  - Port: Listening on `5678` (TCP `*:5678` / `*:rrac`)
- **Database Location**: `~/.n8n/database.sqlite` (SQLite 3 with active WAL mode).

### 1.2 Extraction Commands Executed (Read-Only)
1. **SQLite Read-Only Direct Query**:
   ```bash
   sqlite3 "file:~/.n8n/database.sqlite?mode=ro" \
     "SELECT id, name, active, createdAt, updatedAt, versionId FROM workflow_entity WHERE id = 'Bnv0SFCD8oerXXhs';"
   ```
   **Output**:
   ```
   Bnv0SFCD8oerXXhs|WH - WF3c Research Slide Images|0|2026-11-10 09:05:20.916|2026-11-11 08:08:19.433|b47eeeca-85ac-41f5-a206-7048e0989d1f
   ```
2. **n8n CLI Export**:
   ```bash
   n8n export:workflow --id=Bnv0SFCD8oerXXhs --pretty --output=<state_folder>/live_workflow_cli.json
   ```
   **Result**: Successfully exported 1 workflow (34 nodes).

---

## 2. Detailed Node Audits

### 2.1 `Commons Search` Node
- **Node ID**: `21f74cfc-0dea-475c-aef1-e689f2cd592b`
- **Node Type**: `n8n-nodes-base.httpRequest` (v4.2)
- **Position**: `[1696, -64]`
- **Parameters**:
  - **URL**:
    ```
    =https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch={{ encodeURIComponent($json.query + ' filetype:bitmap') }}&prop=imageinfo&iiprop=url%7Cextmetadata%7Cmime%7Csize&iiurlwidth=1200
    ```
  - **`gsrlimit`**: `20` (confirmed matches `WF3c-SPEC.md` step 5).
  - **Query Filter**: Appends `' filetype:bitmap'` to prevent multi-page PDF/DJVU manuscripts from displacing image candidates.
  - **`iiprop`**: `url|extmetadata|mime|size` (note: omits `user` which was listed in spec line 15; does not impact licence filtering).
  - **`origin=*`**: Omitted (server-side HTTP request does not need CORS header).
  - **Headers**:
    - `User-Agent`: `WeHumanity/1.0 (licensed editorial image research; contact: linedesign.works@gmail.com)`
    - `Connection`: `close`
  - **Options**:
    - `timeout`: `5000` ms (5 seconds)
    - `batching`: `batchSize: 1`
    - `responseFormat`: `json`
  - **Retry Settings**:
    - `retryOnFail`: `true`
    - `maxTries`: `3`
    - `waitBetweenTries`: `5000` ms (5 seconds)
- **Associated Pacing Node (`Pace Commons Searches`)**:
  - Type: `n8n-nodes-base.wait` (v1.1)
  - `amount`: `1` (1 second between search iterations, NOT 3 seconds as stated in historical notes).

### 2.2 `Plan Slides` Node
- **Node ID**: `71dc3dd8-14bf-4d9d-94fd-769078aaa299`
- **Node Type**: `@n8n/n8n-nodes-langchain.googleGemini` (v1.1)
- **Position**: `[672, 80]`
- **Credentials**: `googlePalmApi` ("Google Gemini(PaLM) Api account", ID `aFRned7DK9GTsDf4`)
- **Parameters**:
  - **Model ID**: `models/gemini-3.8-flash` (confirmed! Superseded the older `models/gemini-3.5-flash-lite` from 26-node version).
  - **Messages**:
    ```json
    {
      "values": [
        {
          "content": "={{ $json.planningPrompt }}"
        }
      ]
    }
    ```
  - **System Prompt**: None configured in node parameters. All persona and task rules are delivered via the prompt message built in upstream `Build Planning Prompt`.
  - **Temperature**: None / default (`options: {}`).
  - **JSON Output**: `true` (`jsonOutput: true`).
  - **JSON Schema**: No JSON schema parameter is set in the node configuration. Prompt A instructs:
    `Return ONLY JSON in this shape: {"slides":[{"slide_index":1,"slide_type":"cover|object|person|process|detail|remember","subject":"...","search_queries":["...","..."],"note":"","verify":false}, ... 6 items]}`
  - **Downstream Schema Validation**: Handled by node `Validate Plan` (Code node), which strictly enforces:
    - Exactly 6 slides.
    - Unique `slide_index` 1 through 6.
    - Non-empty `subject` and `slide_type`.
    - Array of 2–3 non-empty string `search_queries`.

### 2.3 `Build Assets Record` Node
- **Node ID**: `d4cbf037-33ca-49d7-a5ec-621ca701c40f`
- **Node Type**: `n8n-nodes-base.code` (v2)
- **Position**: `[4480, 256]`
- **Acceptance Condition**:
  ```javascript
  if (!c || (s.result !== 'selected' && s.result !== 'needs_review')) {
    throw new Error('Refusing Asset without a validated candidate');
  }
  ```
  *(Updated from pre-edit version which refused anything other than `selected` with `confidence === 'high'`).*
- **Size Limit**: Enforces `bytes.length <= 5000000` (5MB direct Airtable attachment boundary).
- **Exact Field Mapping Output**:
  | Field Name | Target Type | Value Expression | Specification Comparison |
  |---|---|---|---|
  | `Name` | String | `'Rams WF3c S' + s.slide_index + ' — ' + s.subject` | Hardcodes `'Rams WF3c S'` prefix instead of generic story title. |
  | `Story` | Array[String] | `[$('Get Rams').first().json.id]` | Array containing Airtable Story record ID (named `Story link` in spec). |
  | `Type` | String | `'image'` | Matches spec (`image`). |
  | `Source URL` | String | `c.pageUrl` | Matches spec (Commons description page). |
  | `License` | String | `c.licenceRaw` | **Difference**: Uses raw licence string (e.g. `CC BY-SA 3.0`, `CC BY 4.0`) rather than normalised `c.licence`. Requires Airtable to have matching select option. |
  | `AI Generated` | Boolean | `false` | Matches spec. |
  | `Slide Index` | Number | `s.slide_index` | Matches spec (1–6). |
  | `Slide Type` | String | `({object:'context',person:'people',detail:'process'})[s.slide_type] \|\| (['cover','context','problem','process','people','remember'].includes(s.slide_type) ? s.slide_type : 'context')` | **Difference**: Mapped to fit Airtable `Slide Type` single select options (`context`, `people`, `process`, `cover`, `problem`, `remember`). Spec had `object` and `detail`. |
  | `Model` | String | `$('Plan Slides').params.modelId.value` | Resolves dynamically to `models/gemini-3.8-flash`. |
  | `Generation Prompt` | String | `c.foundQuery` | Search query that located the candidate. |
  | `Credit` | String | `buildCredit(c)` | Formatted attribution string. |
  | `Selection Reason` | String | `s.reason` | Matches Gemini Prompt B selection reason. |
  | `Confidence` | String | `s.confidence` | `high` or `medium` (or review status). |
  | `localPath` | String | `s.localPath` | Internal pipeline metadata. |
  | `attachmentUpload` | Object | `{ contentType, filename, file: base64 }` | Passed to downstream `Upload Saved Asset File`. |
- **Difference in `buildCredit()`**:
  In `Build Assets Record`, `buildCredit()` formats:
  ```javascript
  '"' + title + '" by ' + artist + ', via Wikimedia Commons (' + c.pageUrl + '), ' + label + licenseLink + '. Downloaded without image edits.'
  ```
  This includes `licenseLink` across all licence types and specifies `Downloaded without image edits.`, whereas `licence-filter.js` has a 3-branch function that includes `. Cropped and resized; no other changes.` for CC BY / CC BY-SA and omits licence URLs for CC0/PD.

---

## 3. Workflow Comparison Matrix

| Aspect / Node | `WF3c-SPEC.md` | `WH - WF3c Research Slide Images.json` (Old 26-node) | `n8n/WF3c-research-slide-images.pre-2026-11-11-edits.json` (34-node) | Live n8n (`Bnv0SFCD8oerXXhs`) & `n8n/WF3c-research-slide-images.json` (Canonical) |
|---|---|---|---|---|
| **Node Count** | 13 conceptual steps | 26 nodes | 34 nodes | 34 nodes |
| **Story Trigger** | Dynamic Airtable search (`Status` = approved, `Assets` empty) | Hardcoded `RECORD_ID()='recD3MivrBtHYjGcN'` | Hardcoded `RECORD_ID()='recD3MivrBtHYjGcN'` | Hardcoded `RECORD_ID()='recD3MivrBtHYjGcN'` |
| **Plan Slides Model** | `gemini-...` | `models/gemini-3.5-flash-lite` | `models/gemini-3.8-flash` | `models/gemini-3.8-flash` |
| **Plan Slides System Prompt** | Embedded in Prompt A | In user message | In user message | In user message |
| **Commons Search `gsrlimit`** | `20` | `5` | `5` | `20` |
| **Commons Search Retry** | Not specified | 3 tries, 1000 ms wait | 3 tries, 10000 ms wait | 3 tries, 5000 ms wait |
| **Commons Search Bitmap Filter** | None | None | None | Appends `+ ' filetype:bitmap'` |
| **Pace Commons Searches** | Not specified | 1 second | 3 seconds | 1 second |
| **Person-led Images** | Allowed (Nov 11 decision) | Rejected by prompt & code filter | Rejected by prompt & code filter | Allowed; prompt updated, regex filter removed |
| **Candidate Ranking** | Licence tier first, width second | Licence tier first, width second | Licence tier first, width second | Token relevance first, width second, licence tier third |
| **Candidate Deduplication** | Not specified | None | None | `Apply Choice` tracks used IDs, falls back to next pool candidate |
| **Download Error Handling** | Fail slide | Terminates execution | Routed to `Capture Image Failure` branch | Routed to `Capture Image Failure` branch |
| **Asset Creation Mode** | Create with binary file | Create with File URL | Create Asset + Upload binary | Create Asset + Upload binary |
| **Asset Nodes Enabled** | Enabled | Enabled | Enabled | Both `disabled: true` |
| **Approved / Status Writes** | Never write `Approved` | None | None | None (100% compliant) |

---

## 4. Safety & Constraint Verification

- [x] **Read-Only Inspection**: Verified via static file analysis, read-only SQLite connection, and read-only CLI export.
- [x] **No Workflow Execution**: No executions were triggered.
- [x] **No Commons / Openverse Network Requests**: No external API calls were initiated.
- [x] **No Airtable Writes**: No updates or inserts were made.
- [x] **Status & Approval Guard**: Thorough static scanning across all 34 nodes confirmed zero nodes write to `Approved` or alter record `Status`.
- [x] **Model & Credential Immutability**: All model identifiers and credentials remained untouched.
