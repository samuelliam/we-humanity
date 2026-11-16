# WF3c — Research Slide Images (spec)

Goal: for a Story with a 6-slide carousel plan, find a licensed image relevant to each object or subject, download it, log it to Assets, and flag the Story if any slide lacks a confident match. Images are not limited to photographs. AI-generated images are allowed, but each one must be recorded with `AI Generated` checked.

## Division of labour
- **Model (Gemini):** plans slides; proposes search terms; picks the best candidate from a shortlist and gives a confidence rating. It never decides licences, downloads, or writes credits.
- **Code (n8n Code nodes, from `licence-filter.js`):** Commons search, licence filter, ranking, download, credit string, Airtable writes.

## Node chain
1. **Manual Trigger / Airtable Search** — fetch Stories where `Status` = the approved/drafted state and `Assets` is empty. Input for one story: Title, Pillar, Glance, Explore, Deep Dive, Remember.
2. **Gemini — Plan slides** (prompt A below). Output: JSON, 6 slides.
3. **Code — Validate plan** — check exactly 6 slides, `slide_index` 1–6, each has `slide_type`, `subject`, `search_queries` (2–3 strings). Throw on failure.
4. **Loop over slides (SplitInBatches, batch 1)**
5. **HTTP Request — Commons search** per query:
   `GET https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch={{query}}&prop=imageinfo&iiprop=url|extmetadata|mime|size|user&iiurlwidth=1200&origin=*`
   Send a descriptive `User-Agent` header (e.g. `WeHumanityBot/0.1 (contact: <owner email>)`).
   Merge results across queries; dedupe by `pageid`.
6. **Code — Parse and filter** — paste `licence-filter.js` functions; map each Commons page with `parseCommonsPage`, then `filterAndRank`. Keep top 5 candidates. If 0 remain → mark slide `no_candidates` and go to the fallback in step 6a. Every slide must end with at least one image; no slide is left empty.
   6a. **Fallback when 0 candidates remain** — run one broader search for the same subject (the slide's first query with the subject words only), using the same filter. If still 0 → mark `no_candidates` and flag for human supply of an image. Do not create a placeholder image without human approval.
7. **Gemini — Choose candidate** (prompt B). Input: slide subject + the 5 shortlisted candidates (title, description, artist, dateCreated, width, licence). Output: `{ chosen_pageid | null, confidence: "high"|"medium"|"low", reason }`. Code validates that `chosen_pageid` is one of the shortlisted IDs; otherwise treat as null.
8. **IF — confidence = high** → continue. Otherwise → still download and attach the chosen candidate, and mark slide `needs_review` (the human reviewer may appeal or regenerate). If the model returned no choice, attach the top-ranked filtered candidate and mark `needs_review`.
9. **HTTP Request — Download file** from `downloadUrl` (thumb 1200px). Save as binary. Verify response is an image MIME type and size > 10 KB; otherwise fail the slide.
10. **Code — Build Assets record** — apply `buildCredit`, set fields per the mapping below.
11. **Airtable — Create record in Assets** (and link to Story).
12. **Loop end**. Aggregate per-slide results.
13. **Airtable — Update Story** — if any slide is `no_candidates`, `needs_review`, or failed: read the current `Flags` first, append `image needs review` only if not already present, and never overwrite other flags. List the slide numbers in `Reviewer Notes` (append, do not overwrite).

## Gemini prompt A — Plan slides
```
You are planning the six slides of a social carousel for WE, HUMANITY, a reverent but not stuffy series about human creativity, design and craftsmanship.

Story title: {{title}}
Pillar: {{pillar}}
Glance: {{glance}}
Explore: {{explore}}
Deep dive: {{deep_dive}}
Remember: {{remember}}

Rules:
- Exactly 6 slides. Slide 1 is the cover; slide 6 carries the Remember line.
- For each slide, name the REAL subject to photograph: a specific object, person, place, or drawing that exists and can be found in a museum or photo archive (e.g. "Bialetti Moka Express stovetop coffee maker, 1933 model"). Do not invent products, models, or variants. If no concrete real subject fits, use "abstract" and explain in `note`.
- Give 2–3 `search_queries` that would find that exact subject on Wikimedia Commons (short, specific, English).
- Do not invent facts. Do not write slide text or captions.
- Flag anything you are unsure exists as `"verify": true`.

Return ONLY JSON in this shape:
{"slides":[{"slide_index":1,"slide_type":"cover|object|person|process|detail|remember","subject":"...","search_queries":["...","..."],"note":"","verify":false}, ... 6 items]}
```

## Gemini prompt B — Choose candidate
```
You are checking whether a Wikimedia Commons image shows the requested subject.

Requested subject: {{subject}}
Story context: {{title}}

Candidates (JSON array; use pageid to refer to them):
{{candidates_json}}

Choose the single candidate that best shows the requested subject (the object itself, recognisable, not a different model or a related object).

Person-led images are allowed if they are relevant to the requested subject. Rate confidence:
- high: the title or description clearly identifies the requested subject.
- medium: plausibly the subject but not confirmed by the metadata.
- low: unrelated, wrong model, or cannot tell.
If none match, return chosen_pageid null with confidence low.

Return ONLY JSON: {"chosen_pageid": 123 | null, "confidence": "high|medium|low", "reason": "one sentence"}
```

## Assets field mapping
| Assets field | Source |
|---|---|
| Name | slide subject + slide index, e.g. `Rams S2 — Braun T3 radio` |
| Story link | Story record ID |
| Type | the existing option used by WF3b (`image`). Confirm in Airtable; do not create a new option |
| File | downloaded binary |
| Source URL | `pageUrl` (Commons file page) |
| License | `licence`. Must match an existing option exactly: `CC BY-SA 4.0`, `CC BY 4.0`, `CC0`, `Public domain`. Confirm the field options before the first create; stop on mismatch |
| AI Generated | `true` if the image was AI-generated, otherwise `false` |
| Slide Index | `slide_index` |
| Slide Type | `slide_type` |
| Model | `gemini-…` model name used for the plan and choice (confirm exact name in AI Studio) |
| Generation Prompt | the search query that found the chosen candidate |
| Credit | `buildCredit(chosen)`: title, author, licence name and link, Commons page URL, change note. Show this on the slide where the licence requires it |
| Selection Reason | Gemini `reason` from prompt B |
| Confidence | `confidence` from prompt B |

## Keep-out rules
- Person-led images are allowed on any slide if the licence is valid and the image is relevant to the slide subject (decision, 11 November). The human reviewer still checks each one.
- Code, not the model, enforces licence; the model only chooses among pre-filtered candidates.

## Status rules
- `no_candidates` → Flag `image needs review`. Fallback search (step 6a) runs first.
- `confidence` ≠ high → Flag `image needs review`; the chosen candidate is still attached.
- Every slide must end with an attached image. A slide with no image after step 6a is a hard review item.
- Download or verification failure → Flag `image needs review`; log the error text.
- Never attach an image that failed the licence filter, even if the model chose it (code validates `chosen_pageid` against the filtered list).

## Acceptance tests (run before enabling on real stories)
1. Run on the Rams story: every attached image's Commons page shows the licence in Assets, and a human opens each Source URL and confirms the object matches the slide subject.
2. Force a bad plan (5 slides) → validation node throws, no Airtable writes.
3. Force a no-match query (e.g. `zzzqqq object`) → slide logged `no_candidates`, Story flagged.
4. Confirm `Credit` appears in Assets for every image with a licence requiring attribution.
