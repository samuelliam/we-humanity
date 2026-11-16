# WE, HUMANITY — Creating Narrated Instagram Reels in Google Flow

Use this workflow to turn any **WE, HUMANITY** story into a 30–45 second cinematic `9:16` Instagram Reel using **Google Flow** (powered by Veo 3).

---

## 1. Set Up Google Flow for Reels (Important!)

Before pasting any prompt in [Google Flow](https://labs.google/fx/tools/flow):
1. **Mode:** Switch the generator mode to **Text to Video** (or **Frames to Video** if animating a downloaded slide photo). *Do not leave it on Image mode.*
2. **Aspect Ratio:** Set **9:16 (Portrait)** so clips fill the full Instagram Reels frame.
3. **Model:** Choose **Veo 3 - Fast** for quick iterations, or **Veo 3 - Quality** for hero opening shots.

---

## 2. Build a 30–45s Multi-Scene Reel (Scene Builder)

Each single Flow generation creates an ~8–10 second clip. To cover a full **WE, HUMANITY** story:

1. Open your story in **WE, HUMANITY Studio** (`http://127.0.0.1:5695`) and keep the **Instagram** tab visible for the story arc and **Recommended IG Music**.
2. Generate **4–5 clips** (one per story beat: Hook → Constraint → Mechanism → Detail → Legacy):
   - **Scene 1 (Hook):** Dramatic wide/establishing shot of the artifact or structure.
   - **Scene 2 (Constraint):** Visual of the problem or environment (e.g., *empty desert*, *1420 unfinished cathedral walls*, *1960s spacecraft cockpit*).
   - **Scene 3 (Mechanism):** Tactile close-up showing *how* it works (e.g., *herringbone brick courses*, *bronze gears*, *three-button mouse*).
   - **Scene 4 (Proof / Legacy):** Final human-scale reveal or timeless principle.
3. Use Flow's **Scene Builder** (or **Extend** / **Jump to**) to chain your 4–5 clips into one continuous `30–45s` timeline.

### Prompt Template (Copy & Adapt per Scene)
```text
9:16 vertical documentary VIDEO CLIP (moving footage, not a still image).
Subject: [EXACT ARTIFACT / SCENE FROM STORY].
Action & camera: Slow cinematic dolly-in, subtle natural light shifting across authentic materials and craftsmanship, museum-grade realism.
Rules: No on-screen text, no subtitles, no watermarks.
```

> [!TIP]
> **Using your archival photos (Frames to Video):** Click **Download .zip** in the Studio, extract the slide or source image, and upload it as the **Starting Frame** in Flow's **Frames to Video** mode to bring real museum artifacts to life with subtle camera motion.

---

## 3. Add Voiceover Narration & Captions

- **Narration Script:** Read your story's **Glance → Explore → Deep Dive → Remember** beats (or the **Instagram Caption** paragraphs in the Studio) at a calm, steady pace—about **30–40 seconds total**.
- **Voiceover Options:**
  - Record directly in **Instagram Reels → Voiceover**, **CapCut**, or **iMovie** over the exported Flow video.
  - Or enable Flow's **Veo 3 native audio** / ambient sound effects (`"soft stone acoustics, quiet workshop ambiance, no speech"`) and layer your voiceover on top.
- **On-Screen Captions (Reels Safe Zone):**
  - Keep titles and auto-captions in the **middle-lower safe zone** (above the bottom ~20% where Instagram places your handle and caption, and clear of the right-side Like/Comment/Share buttons).
  - Add a subtle `@by.wehumanity` handle at the top or safe bottom-left.

---

## 4. Add Music & Publish to `@by.wehumanity`

1. Transfer the final `1080×1920` `.mp4` to your phone (AirDrop).
2. In the **Instagram app → New Reel**:
   - Tap **Audio** and search one of the 3 tracks listed in the Studio's **Recommended IG Music** panel (e.g., *Experience — Ludovico Einaudi*, *Cornfield Chase — Hans Zimmer*, *Saman — Ólafur Arnalds*).
   - Set **Original Audio (Voiceover)** to ~`85–100%` and **Added Music** to ~`12–18%` so the narration stays crystal clear.
3. Copy the **Instagram Caption** from the Studio (it already has your searchable first-line hook, story summary, question CTA, and 3–5 hashtags) and post!
