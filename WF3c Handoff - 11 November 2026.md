
# WF3c Handoff: WE HUMANITY Research Slide Images

Date of handoff: 11 November 2026 (Asia/Singapore)

## 1. Purpose

WF3c finds, checks, and records openly licensed images for research slides in the WE HUMANITY project. It writes to Airtable and saves image files locally. Images are candidates only until a human has checked them.

## 2. Non-negotiable rules

- Never set `Approved` or change Status to approved. Only a human does this in Airtable, after the Section A items are resolved.
- Do not run the workflow, any Commons or Openverse search, or any Airtable write unless the task explicitly allows it.
- Do not call Wikimedia Commons before **12 November 2026** at the earliest. A 429 rate-limit block was received on 11 November.
- Do not change credentials, API keys, tokens, or model names without asking.
- Do not paste or display secrets. Use n8n credentials only.
- Ask before any change not named in the current task.
- Report exactly what you did and what you could not check. Quote the node name and exact setting or code line behind each claim.

## 3. Key identifiers

- Project folder: `/Users/admin/Documents/My Workspace/we-humanity-wf3c/`
- Handoff folder: `we-humanity-wf3c/handoff/`
- Spec: `handoff/WF3c-SPEC.md`
- Steps: `handoff/HUMAN-AND-WORKER-STEPS.md`
- Change report: `handoff/WF3c-requested-change-report.md` (may be missing from handoff; copy it in if so)
- Canonical workflow export: `n8n/WF3c-research-slide-images.json` (34 nodes, the newer version)
- Older draft: `WH - WF3c Research Slide Images.json` (26 nodes, superseded)
- n8n workflow: "WH - WF3c Research Slide Images", inactive, no Schedule Trigger, Manual Trigger only
- Airtable base: Stories table `tblPgv6MsUEMNnvCn`, Assets table `tbl8HCdgugwL3SZjy`
- Rams Story record: `recD3MivrBtHYjGcN`
- Beck Story: record ID not recorded here; find it in Airtable
- Model in use: `models/gemini-3.8-flash` (Plan Slides, Choose Candidate, and the Assets Model field). Confirm Plan Slides before a run, since an earlier report read 3.5-flash-lite.

## 4. Current state

### Workflow
- Two exports exist. Use the 34-node file as the reference.
- Changes made and reported as static-checked:
  - Create Asset is `create`, not upsert.
  - Download Image and Verify Image have failure routes that append `image failed: <slide_index> <error>` to Flags and Reviewer Notes without overwriting.
  - Save File and Verify Image write to `we-humanity-wf3c/assets/rams/slide_<index>.<ext>`.
  - `buildCredit` includes the licence URL when present, for all licence types, and returns the final change note.
  - Attachment: Read Saved Image reads the file, then Upload Saved Asset File sends it to Airtable. This is untested live.
- Commons Search settings (34-node file):
  - User-Agent: `WeHumanity/1.0 (licensed editorial image research; contact: linedesign.works@gmail.com)`
  - Pause before search: 3 seconds
  - Retry on fail: on, 3 tries, 10 seconds between tries, timeout 5 seconds
- Live n8n check (11 November, read-only, via the editor UI):
  - Commons Search: User-Agent matches. Retry on fail on, 3 tries. **Wait Between Tries is 5000 ms live, not 10000 ms as in the export.** URL has `gsrlimit=5` (spec says 20). Options timeout not checked live.
  - Read Current Story and Record Research Review: retry on fail on. Create Asset: retry off, operation `create`, fields match the export.
  - No `Approved` field or write seen in the export or in the four nodes opened live. Not a full live check of every node.
  - Pace Commons Searches (3 seconds) not checked live.
- Read Current Story and Record Research Review have retry on fail in the 34-node file. Create Asset does not.

### Tests
- **Test 2 (5-slide plan):** PASS. Validate Plan threw "expected exactly 6 slides". No Airtable writes.
- **Test 3 (`zzzqqq object`, six slides):** PASS after one Airtable read timeout and a resumed run. All six reached No Candidates. Six `no_candidates` lines were appended to Reviewer Notes on the Rams Story. `image needs review` appears once in Flags.
- **Rams gated test:** FAILED / STOPPED. Commons Search returned HTTP 429 from Wikimedia ("too many requests", request ID b7d1cb6c-464d-404e-9212-082dead93265). Read Saved Image was not reached. No Assets were created or opened.
- Failure routing, the saved-file read, and the attachment upload have not been tested live.

### Rams Story (`recD3MivrBtHYjGcN`)
- Found **Approved = checked** at the start of the test session. The user changed this manually in Airtable. The workflow did not set it.
- Reset to Status `needs_review`, Approved unchecked. Confirmed by a final read.
- Flags: `dates or numbers; quotes or motives attributed to a person; living people; sources not verified; image needs review`
- Reviewer Notes include six test-output `no_candidates` lines from test 3. Mark them as test output.
- Section A items are all unchecked.

### Beck Story
- Not approved. Section A items are unchecked.

### Gemini's read-only report (11 November)
- Confirmed the 34-node file, the failure, upload, and saved-image nodes, Create Asset as `create`, and no node that writes `Approved`.
- Two points are not yet confirmed in the live n8n workflow: the User-Agent and the pacing values. Check both in n8n.
- It flagged that `WF3c-requested-change-report.md` was missing from handoff. Verify.

### Session notes, 11 November (after the handoff was written)
- **Rule change, 11 November (user decision):** the "no AI-generated images" rule is removed. Any image is allowed if it is relevant to the subject and licensed. AI-generated images must be recorded with `AI Generated` checked. Removed from `WF3c-SPEC.md` (purpose line and Assets mapping) and `HUMAN-AND-WORKER-STEPS.md` (worker prompt D). Licence, relevance, and human-verification rules are unchanged. The WF3c workflow in n8n has not been changed for this.
- **Decisions, 11 November (user):**
  1. Person-led images are allowed on any slide, provided the licence is valid. This replaces the earlier rule that people as the main subject are rejected. Relevance to the slide subject still applies.
  2. Every slide needs at least one image. No slide may be left without one. If the first choice is not liked, the user will appeal, comment, and regenerate. This conflicts with the current `no_candidates` and `needs_review` paths in WF3c, which skip the image. Not yet changed in the spec or n8n.
  3. AI-generated image rule removal: already applied to the spec and worker steps (see the rule change entry above).
- **n8n changes, 11 November (after decisions above):** Apply Choice keeps the top-ranked filtered candidate and marks `needs_review` when confidence is low. Selected Photos passes `selected` and `needs_review`. Choose Candidate prompt no longer rejects person-led images. Build Assets Record accepts `needs_review` (it previously refused anything not high-confidence). Step 6a fallback built as a broad query: Expand Queries (`n8n`) adds one query per slide made from the subject words (up to 4, length above 2 characters, no duplicates). It runs with the other queries, not only when a slide has zero candidates. Expand Queries now outputs 22 searches (was 18). This is a simpler design than the spec's conditional step 6a. A conditional re-search loop can be added later if the extra Commons requests are a problem. Test run after this change (11 November, Create Asset and Upload still deactivated): six slide files saved in `assets/rams/`.
- **Root cause found, 11 November (licence ranking beats relevance):** `Parse and Filter` (`n8n`) ranks candidates by licence tier first and width second — `.sort((a,b)=>(rank[a.c.licence]-rank[b.c.licence])||((b.c.width||0)-(a.c.width||0)))` — then keeps only five with `.slice(0,5)`. Public-domain scans therefore outrank the correct CC BY / CC BY-SA photos, and the correct files are cut off. Evidence from execution 168: slide 2's pool was the Cranach painting, a SK61 radio, and Rams furniture photos, although the Commons query `Dieter Rams` returns `File:Designer-Dieter Rams.jpg` (CC BY-SA 3.0, 2115x2115) first; slide 4's pool was five pages of a 1905 French earthquake manuscript, although `Braun ET66` returns two real ET66 calculator photos. `Parse and Filter` also still applies the old person filter `!/(?:\bportrait\b|\bman\b|\bwoman\b|\bpeople\b|\bperson\b)/i` to title and description, which contradicts the person-led rule.
- **Applied via n8n CLI, 11 November (browser session unusable):** the editor could not be used because the n8n REST API kept returning `401 Unauthorized` even after two successful logins (`n8n.audit.user.login.success` at 16:29 and 16:34 for `samuelliam17@gmail.com`); cookies work in the browser (Secure and SameSite=Strict test cookies both stored), so the session is not persisting for another reason. Fixes were applied with `/Users/admin/.npm-global/bin/n8n export:workflow --id=Bnv0SFCD8oerXXhs`, editing the JSON, then `import:workflow`. Backup of the pre-edit live state: `wf-live-backup.json` (temp folder). The live workflow was not run from the UI: `n8n execute --id=Bnv0SFCD8oerXXhs` was used, and it needs `N8N_RUNNERS_BROKER_PORT=5699` because the running server holds port 5679. Create Asset and Upload Saved Asset File are still `disabled: true`.
- **Fix applied (relevance ranking + person filter removed):** rank by subject-token relevance first, then licence tier, then width, and drop candidates with zero token hits when any candidate has a hit; remove the person filter. Offline simulation on the run-168 queries: slide 2 top result becomes `Designer-Dieter Rams.jpg` (4 token hits), slide 3 becomes `Braun Phonosuper SK4.png` then `Braun Phonosuper SK4 Schneewittchensarg.JPG`, slide 4 becomes `Dieter Rams i Dieter Lubs- Calculator Braun ET66-1987.dhub.jpg` (7 hits) and `1987 Braun calculator ET66 by Dieter Rams (13964223413).jpg` (6 hits). No extra Commons requests.
- **Run 169, 11 November (CLI, Create Asset and Upload still deactivated):** success, 1m 49s, no Airtable writes. Saved `slide_1.JPG` (SK4), `slide_2.jpg` (Dieter Rams portrait, CC BY-SA, correct), `slide_5.jpg` (Braun ET66 calculator, correct), `slide_6.jpg` (606 shelving). `Apply Choice` results: slide 1 `selected` (high), slide 2 `selected` (high, `File:Designer-Dieter Rams.jpg`), slide 3 `duplicate` (same file as slide 1, not reused), slide 4 `no_image` (low), slide 5 `selected` (high, `File:1987 Braun calculator ET66 by Dieter Rams (13964223413).jpg`), slide 6 `selected` (high, `File:606-Universal-Shelving-System.jpg`). Earlier files moved to `assets/rams/_previous/`.
- **New problem found in run 169 (query quality, not ranking):** `Plan Slides` produced a different plan from run 168 — slide 4 became "Detail of Braun SK 4 control knobs and tonearm" and the Braun T3 radio slide disappeared. For that slide the Commons queries returned unrelated material: `Braun SK 4 detail` returned Amsterdam views, a Rijksmuseum painting, PDFs and botanical notebooks; `Braun SK 4 controls` returned PDFs and a 1903 image; `Braun SK4 knobs` returned 0 pages. Only one candidate survived (the Zdenka Braunerová painting), and Gemini correctly rejected it. Cause: Commons full-text search matches loosely, and non-image formats (PDF, DJVU) occupy the 20 result slots. Proposed, not applied: add `filetype:bitmap` and `intitle:` terms to the queries, and require word-boundary matching for plain-word tokens (`braun` currently matches `Braunerová`).
- **Applied, run 171 (search fixes):** `Commons Search` URL now appends `' filetype:bitmap'` inside `encodeURIComponent`, so PDFs and DJVUs no longer take result slots. `Parse and Filter` relevance now requires a whole-word match for plain words (`words.has(t)`) and keeps substring matching only for tokens containing a digit (`sk4`, `et66`, `606`), so `braun` no longer matches `Braunerová`. `Expand Queries` drops descriptor words (`GENERIC` set: detail, details, closeup, close-up, close, view, angle, shot, photo, photograph, image, controls, knobs, tonearm, macro, background) from each query and de-duplicates, so `Braun SK 4 detail` becomes `Braun SK 4`. Run 171 result: slides 1, 2, 4, 5, 6 saved and correct; slide 3 became `duplicate` because Gemini again chose slide 1's file, even though its pool now held `Braun Phonosuper SK4.png`, `Braun SK 4.png` and `Braun SK 4.1.png`. Open decision: on a duplicate, take the next unused candidate and mark `needs_review`, instead of saving no image.
- **`intitle:` variants rejected, 11 November:** tested against live Commons and not applied. `intitle:braun` returns Wernher von Braun, Carol Moseley Braun and other people; `intitle:sk4` returns SK4 postcodes (Stockport) and litter bins; `intitle:vitsoe intitle:606` returns 0 results because titles write `Vitsoe606.jpg` without a word break. Only `intitle:braun intitle:sk4` and `intitle:braun intitle:et66` were precise, so a generic rule would regress other slides.
- **Plan instability, 11 November:** `Plan Slides` produced three different six-slide plans across runs 168, 169, 170 and 171 (slide order, subjects and queries all changed; the T3 slide disappeared in one run and returned in another). Slide numbering therefore cannot be trusted across runs, which matters for review, Airtable mapping, and any manual image supplied for a specific slide. Not fixed.
- **Duplicate fallback applied + ranking tie-break changed, run 173:** `Apply Choice` now takes the next unused candidate from the same ranked pool when Gemini's pick is already used, and marks it `needs_review` (it records `duplicate_of`). `Parse and Filter` sort is now relevance, then width, then licence — sorting width before licence is what brings `Designer-Dieter Rams.jpg` back into the top 5 (it is CC BY-SA, and the earlier CC-BY-first tie-break pushed it out; the search itself returns it at rank 7 of 20). Run 173: all six slides got an image, no duplicate files. slide 1 `1956 Braun Phonosuper SK4 Schneewittchensarg.JPG` (selected), slide 2 `Designer-Dieter Rams.jpg` (selected), slide 3 `Braun Radio mit Plattenspieler Pinakothek der Moderne (Foto Hilarmont).jpg` (`needs_review`, `duplicate_of: 1`), slide 4 `Braun SK 4.1.jpg` (selected), slide 5 `1987 Braun calculator ET66 by Dieter Rams (13964223413).jpg` (selected), slide 6 `606-Universal-Shelving-System.jpg` (selected). Slide 4's subject was "Detail of the tuning scale, buttons, and control knobs" but the saved photo is a general SK4 view, so a human may want to replace it.
- **Correction to an earlier review, 11 November:** slide 5's saved file was `File:Transistor radio, model TR-1 (left); model T3 (right), LACMA, October 2026.jpg` — the Braun T3 is in it, so the image was correct. It was called "likely wrong brand" and deleted in error. A later run will fetch it again.
- **Duplicate check, 11 November:** `Apply Choice` now keeps a Map of chosen pageids in slide order and refuses to reuse one, setting `result: 'duplicate'` and `duplicate_of: <slide>`. Written in the editor but **not saved**: the n8n session returned `401 Unauthorized` (workflow `updatedAt` stayed `2026-11-11 08:08:19`, and `nodes` did not contain the new code). Re-apply after login.
- **Test run ID#165, 11 November (Create Asset and Upload still deactivated):** succeeded in 3m 42s. Six slide files saved in `assets/rams/` (slide_1 to slide_6). Earlier picks changed, so the earlier manual review of slides 2, 3, 5, and 6 no longer applies. Each image needs review again.
- **Owner override, 11 November:** the user has lifted the 12 November hold and says Commons works again. Asset creation and upload stay off until the user approves them after the saved file is checked.
- Commons Search was called on 11 November, earlier than the 12 November limit. Reason: the user ran it to test. It returned results, and the rate limit was not hit again as far as the user reports. This is recorded so the next run is planned with the request count in mind.
- Commons Search: the live setting is Retry On Fail on, 3 tries, 5000 ms wait. The 429 block came from repeated requests and retries. Consider turning retries off for this node (not yet decided).
- Choose Candidate (Google Gemini, `models/gemini-3.8-flash`) failed once with `connect ETIMEDOUT` to Google. This was a connection error, not a prompt error. The prompt text and its inputs were checked: `$json.subject` and `$('Get Rams').first().json.Title` are supplied by the chain. The user reports that Choose Candidate now works and that Retry On Fail is enabled on it (user confirmed again on 11 November; not checked in n8n by the assistant).
- When Choose Candidate is run alone, n8n re-runs upstream nodes (Commons Search) if their output is missing or they were edited. Pinning Parse and Filter's output would stop that, but it has not been done.
- Openverse API: the search endpoint `https://api.openverse.org/v1/images/?q=...` responded without a key. Results include `license`, `license_url`, `creator`, `attribution`, `source`, and `foreign_landing_url`. The API root page does not show text, but this does not mean the API is down. Standard-tier authentication still needs a registered app.

## 5. Decisions made

- Wikimedia Commons stays the primary image source. Wait until 12 November before any call.
- Jina AI was considered and not adopted. It doesn't provide licence fields, and it adds a third-party data flow.
- Openverse is an option for a fallback search only, and only if Commons is still blocked or returns no confident match. Its docs have not been read yet. The user has pasted the setup URL, but the page content has not been provided to the assistant.
- The User-Agent contact address is the user's chosen one. Note that it has been read into this handoff and Gemini's report.
- Rams and Beck stay unapproved until Section A is resolved.

## 6. Open items (in priority order)

1. **Resolved (step 3 closed):** Rams Approved was changed manually by the user in Airtable, not by the workflow. Still confirm in step 2 that no node writes `Approved` during a normal run.
2. **Live Commons Search settings (checked 11 November):** User-Agent and retry match. **Wait Between Tries is 5000 ms live, export says 10000 ms. Decide which is intended and align them.** Pace (3 seconds) and timeout still to confirm live. Re-check on 11 November: the live "WH - WF3c Research Slide Images" has the same 34 node names as the export. Commons Search Wait Between Tries is still 5000 ms live (Max Tries 3). The latest saved version in n8n version history is "Nov 11 at 13:29:39" by "samuel liam". That is later than the export (02:18 UTC). No change was made by the assistant. Confirm who saved it at 13:29 and whether it was intended. A full field-by-field diff against the export has not been done.
3. **Test copies (checked and archived 11 November):** "WH WF3c acceptance test 2", "WH WF3c acceptance test 3", "WH - WF3c Rams gated test (no Asset writes)", and "WH WF3c test 3 review resume" are archived in n8n. None showed an Active badge. Archive is reversible; permanent delete is still possible from the archive. Not yet checked: stray Assets records in Airtable from earlier runs.
   - Also archived (11 November): "WH Image download diagnostic", "WH Mixed candidates diagnostic", "WH No candidates diagnostic", "WH Candidate prompt diagnostic", "WH Commons request diagnostic".
   - Not WF3c: "WH - WF2 Draft Story (test)" and "WH - WF3b Carousel AI Slides". Left alone.
   - n8n now lists 3 workflows: the WF3c workflow, WF2 Draft Story (test), and WF3b Carousel AI Slides.
4. **Confirm Plan Slides uses `models/gemini-3.8-flash`** and that Build Assets Record gets the same value.
5. **Gated Rams test, after 12 November:** Asset creation and upload disabled, run once to Read Saved Image.
6. **Inspect Read Saved Image output for one slide:** file size and type. Stop if it is empty or not a real image.
7. **Decide on Openverse:** provide the API docs excerpts (authentication, rate limits, image search endpoint, one example response, attribution, terms). Then write the field mapping and fallback design.
8. **Section A for Rams:** source verification, quotes, motive attributions, dates and figures, Braun model names, living-status check, and the rattling-lid, competitor, assumed-rejection, acrylic, T3, and ET66 credit items.
9. **Section A for Beck:** the "initial resistance" claim, 1933 date, payment/dismissal/credit claims, book editions and publishers, and the geographic distortion claim.
10. **Both Stories:** trace every number, date, and name to a line in Sources. Confirm living-person claims.

## 7. Verification rules for any image

Every Asset record needs all of these checks, against the Commons (or source) page, not model output:

- The object shown matches the slide subject. Not a related model, portrait, font diagram, schematic, or illustration.
- A person may be the main subject, if the licence is valid and the image is relevant to the slide (decision, 11 November).
- The licence on the source page matches the Assets `License` field.
- `Credit` includes the artist, licence, file title, and licence URL where available.
- `Type` is `image`, `AI Generated` is unchecked.
- The saved file is a real image, not an HTML error page or an empty file.
- Record pass or fail per slide. Delete any failing Asset and note the reason in Reviewer Notes.

## 8. Next-step order

1. Read this handoff and the spec files. Summarise the state in five lines. Stop.
2. Read-only check of the live n8n Commons Search, Read Current Story, Record Research Review, and Create Asset nodes. Report settings and quote them. Stop.
3. Investigate the Rams Approved change. Report findings. Stop.
4. On or after 12 November, and only with the user's go-ahead: run the gated Rams test with Asset writes disabled.
5. Inspect the saved file output. Stop and report.
6. Only after the user confirms: enable Asset writes for a single test slide, then the full run.

## 9. Instruction for the receiving harness

Start read-only. Read the files in `handoff/`, then report the current state in five lines and list any file you could not find. Do not run or change anything until the user confirms the next step.
