# Human checks and worker prompts

## A. Source-verification checklist (human, before approving Rams or Beck)

Do not approve a Story until every row is ticked. Record outcomes in Reviewer Notes.

### Dieter Rams — ten principles of good design
- [ ] Each Source is a real, findable publication (check ISBN/publisher on the catalogue page, not the model's text).
- [ ] Edition and page numbers match the copy you checked. Remove any page number you cannot confirm.
- [ ] The "ten principles" list wording: confirm against a primary or Vitsœ/Rams Foundation source. The principles were formulated in the 1970s and 1980s and have multiple versions; name the version used.
- [ ] Any quote is verbatim from a source you opened. Paraphrases must not be in quote marks.
- [ ] Any attribution of motive ("Rams wanted…", "Rams believed…") is supported or rewritten as what he said/wrote.
- [ ] Any date or number (years in production, unit counts) is sourced or removed.
- [ ] Braun product references: confirm each named model is a documented Braun product. Do not repeat "video 1", "audio 1", or "tuner 1" as historical objects.
- [ ] Rams is living or recently deceased? Confirm status and phrase accordingly.

### Harry Beck — London Underground map
- [ ] "Initial resistance" to the map: find a source (e.g. London Transport Museum, Transport for London archive, a Beck biography). If no source, rewrite as "the design was not immediately adopted" only if sourced, or remove the claim.
- [ ] The 1933 date and the diagrammatic-map origin: confirm against London Transport Museum material.
- [ ] Any statement that Beck was paid, dismissed, or credited a certain way: source it or remove.
- [ ] Sources list: correct edition and page for each book; check the publisher exists.
- [ ] Any claim about the geography being "distorted" as a design choice: source it.

### Both
- [ ] Every number, date, and proper name in Glance and Explore traces to a Source line.
- [ ] Any quote or motive attribution marked for human check is confirmed or removed.
- [ ] No claims about living people beyond what a source supports.
- [ ] Sources field contains only sources the model actually read, or sources you have opened yourself.

## B. Human steps in n8n / Airtable (need you)

1. **Grounding report** — send me the exact error text (or "no error") and the saved Sources value for Rams.
2. **Approve Rams and Beck** — only after section A. Set Approved in Stories.
3. **Run WF2 for Moka, Thonet, Grossman** — one at a time: open WF2, run once, check the new Story has all four depths and Sources, then Flags. Send me any node error text verbatim.
4. **Node build for WF3c** — give the worker the prompt below; you test on Rams.
5. **Check Gemini model name** in Google AI Studio before relying on WF3c model field.

## C. Worker prompt — Grounding check (WF2)

```
Open WF2 "WH - WF2 Draft Story". In the Message a model (Gemini) node, confirm Google Search grounding is enabled. Run the workflow once for the top queued Backlog item.
Report back:
1. Whether the response contained grounding metadata (groundingMetadata / web search results), yes or no.
2. The exact text of the Sources value saved to the new Story.
3. Any error message, copied verbatim, including node name and HTTP status.
Do not change credentials. Do not mark anything Approved.
```

## D. Worker prompt — Build WF3c

```
Build a new n8n workflow named "WH - WF3c Research Slide Images" from /Users/admin/Documents/My Workspace/we-humanity-wf3c/WF3c-SPEC.md.

Rules:
- Follow the node chain in the spec in order.
- Paste the functions from licence-filter.js into the Code nodes that need them (parseCommonsPage, filterAndRank, buildCredit). Do not change the licence logic.
- The Gemini model name and credential come from the existing WF2 node. Do not create new credentials or type any API key.
- Use the exact prompt text from the spec for Gemini prompts A and B.
- Set the Commons User-Agent header as shown in the spec.
- In Code nodes, paste the function bodies only. Remove any module.exports line.
- Assets Type: use the existing option used by WF3b ("image"), not "Photo".
- Flags: read the current Flags value, then append "image needs review" only if not already present. Do not overwrite.
- Credit: store the full credit from buildCredit (title, author, licence name, licence URL, Commons page URL).
- Prompt B: reject any candidate where a person is the main subject.
- Before the Rams run, check the Assets License options against the licence strings the filter returns (CC BY-SA 4.0, CC BY 4.0, CC0, Public domain). Stop and report any mismatch.
- Do not write to Stories except the Flags and Reviewer Notes fields described in the spec.

Test:
1. Run the acceptance tests in section "Acceptance tests" of the spec, in order.
2. Use the Rams story only.
3. Do not enable the schedule trigger.

Report back:
- Each acceptance test result (pass/fail) with the exact error text if failed.
- The list of Assets records created (Name, License, Source URL).
- Any node that errored, with node name and error verbatim.
```

## E. Live Commons check (you can do this in a browser, no n8n needed)
Open this URL and confirm `LicenseShortName`, `Artist`, `Credit`, and `ImageDescription` appear under `extmetadata`. Copy the exact licence strings and send them to me:
https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=3&gsrsearch=Braun%20T3&prop=imageinfo&iiprop=url|extmetadata|mime|size&iiurlwidth=1200

## F. What I need from you to continue
- Grounding worker report (section B1).
- Exact error text for anything that fails in WF3c or WF2 — copy the message, not a summary.
- The Assets table ID (not yet recorded) so I can update the mapping if field names differ.
