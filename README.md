# WE, HUMANITY

**WE, HUMANITY** is an automated editorial research and social carousel studio celebrating human creativity, discovery, craftsmanship, and design—spanning **both physical artifacts and digital/information design**.

📖 **Full Editorial & System Guide:** [docs/WE-HUMANITY.md](file:///Users/admin/Documents/My%20Workspace/we-humanity-wf3c/docs/WE-HUMANITY.md)

---

## Quick Overview

- **What It Tells:** Constraint-led, source-backed stories about iconic objects, vessels, structures, scientific instruments, and digital/information design breakthroughs—written in plain, vivid language across four narrative depths (**Glance**, **Explore**, **Deep Dive**, **Remember**).
- **Core Pillar & Sub-Themes:** Anchored under **`Form and function`**, rotating across:
  1. **Physical Craft & Vessels** (tools, hulls, industrial design classics)
  2. **Architecture & Infrastructure** (qanats, bridges, passive cooling, survival structures)
  3. **Scientific Instruments & Mapping** (chronometers, star charts, navigation systems)
  4. **Digital Interfaces & Information Design** (early GUIs, iconography, wayfinding maps, computing displays)
- **How Carousels Are Built:**
  - **4 to 7 slides** (`1080×1350` portrait PNGs) adapted to each story's natural visual beats.
  - **Scroll-stopping cover** with a punchy hook, clean subtitle, recognizable archival imagery, and a `Swipe →` cue.
  - **Value-driven headlines** and **28–35 word plain-language body copy** with at most **1–3 highlighted words** per slide.
  - **Single-question pill CTA** on the final slide (e.g., *"Which ancient innovation next?"*).
  - **3-tier licensed image pipeline:** Wikimedia Commons (`Public domain`, `CC0`, `CC BY`, `CC BY-SA`) → Openverse → bright museum/studio-lit Gemini Flash Image synthesis (`AI Generated` flagged).

---

## Running Locally

1. **Start the SVG-to-PNG Render Server (`127.0.0.1:5690`):**
   ```bash
   node scripts/render-server.js
   ```
2. **Start WE, HUMANITY Studio (`127.0.0.1:5695`):**
   ```bash
   node app/server.js
   ```
3. **Run Deterministic Filter & Workflow Guard Tests:**
   ```bash
   node test.js
   ```

---

## Documentation Index

- [docs/WE-HUMANITY.md](file:///Users/admin/Documents/My%20Workspace/we-humanity-wf3c/docs/WE-HUMANITY.md) — Core identity, editorial voice, carousel rules, accuracy standards, and end-to-end architecture.
- [docs/fallback-architecture.md](file:///Users/admin/Documents/My%20Workspace/we-humanity-wf3c/docs/fallback-architecture.md) — 3-tier image sourcing and fallback specification.
- [docs/downstream-publishing-architecture.md](file:///Users/admin/Documents/My%20Workspace/we-humanity-wf3c/docs/downstream-publishing-architecture.md) — `WF4` rendering and social publishing architecture.
- [docs/asset-verification-report.md](file:///Users/admin/Documents/My%20Workspace/we-humanity-wf3c/docs/asset-verification-report.md) — Image verification and licensing audit details.
