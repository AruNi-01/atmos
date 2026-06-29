---
name: atmos-video-gen
description: Create or revise premium, product-led Atmos marketing videos and social promo videos using HyperFrames, with an explicit audio generation decision and a strong design/storyboard pass. Use when Codex needs to build, move, render, or maintain video creative projects under marketing/creative, analyze a reference promo video, improve weak creative direction, generate landing-page or X/Threads video assets, decide whether to generate matching audio, sync generated artifacts into app public folders, or avoid known Atmos video mistakes such as generic AI-looking visuals, rainbow palettes, stale logos, graywashing product screenshots, thin/short content, repetitive scene animation, missing agent icons, writing source projects under apps/landing, creating renders/exports directories instead of artifacts, or forgetting deployment copies.
---

# Atmos Video Gen

## Purpose

Use this skill to produce Atmos marketing video projects with clean repository boundaries and reusable artifacts. Use `$hyperframes` for composition authoring and motion rules, `$hyperframes-cli` for lint/preview/render commands, `$text-to-lottie` for reusable vector motion inserts or overlays that belong inside the video, and `$atmos-audio-gen` for soundtrack generation or revision.

## Workflow

1. Read `marketing/AGENTS.md`, `marketing/creative/AGENTS.md`, and the project's `AGENTS.md` if it exists.
2. If the video is consumed by an app, read that app's `AGENTS.md` before syncing deployable copies.
3. Resolve `audio_mode` before generating the video. Do not silently infer this when the user has not said whether audio is needed.
4. Read `references/project-files.md` before creating or changing project file structure.
5. Read `references/editorial-design-grammar.md` before writing or revising `DESIGN.md`, `SCRIPT.md`, or the HyperFrames composition. If the user supplies a reference video, first extract contact sheets/key frames and translate the reference into reusable design grammar; do not copy the reference brand, mascot, text, or exact sequence.
6. If a beat needs vector-perfect logo, typography, agent icon, diagram, lower-third, counter, or CTA motion that would be brittle or wasteful to hand-build in DOM/CSS, load `$text-to-lottie`. Follow it to author and verify the Lottie scene in the official player first, then copy the approved scene files into the Atmos video project before embedding them in HyperFrames.
7. For a new project, run `scripts/scaffold-atmos-video-project.mjs` to create the standard skeleton, then replace the starter `DESIGN.md`, `SCRIPT.md`, and `index.html` with the real video plan and HyperFrames composition.
8. Create or update the creative project under `marketing/creative/projects/<project-name>/`.
9. Keep the HyperFrames source app under `<project>/hyperframes/`.
10. Write generated outputs to `<project>/artifacts/`, then copy only needed deployable files into the consuming app's public/static folder.
11. Verify the HyperFrames project, any embedded Lottie assets, rendered artifacts, copied app assets, visual design quality, and audio continuity before finishing.

## Skill Resources

- `references/project-files.md` is the source of truth for required project files, file responsibilities, artifact paths, package scripts, and script reuse boundaries.
- `references/editorial-design-grammar.md` is the source of truth for design planning, reference-video analysis, scene density, frame families, proof-led composition, and HyperFrames motion grammar.
- `$text-to-lottie` owns Lottie JSON authoring and Skottie-player verification. This skill owns when Lottie should be used in an Atmos promo, where approved Lottie assets live inside the marketing project, and how they are composed inside HyperFrames.
- `scripts/scaffold-atmos-video-project.mjs` creates the standard project skeleton and a reusable `render-video.mjs` template. It does not produce the final video; it only prepares the workspace.
- This skill intentionally has no `assets/` directory. Do not bundle Atmos logos, agent icons, or screenshots into the skill because they can become stale. Pull current assets from the repository or the project's `source/` and `hyperframes/assets/` directories.

Scaffold example:

```bash
node .agents/skills/atmos-video-gen/scripts/scaffold-atmos-video-project.mjs feature-tour --duration 30 --audio-mode ask --consumer landing
```

## Audio Mode Parameter

Treat video generation as accepting an `audio_mode` parameter:

- `ask` — default when the user did not specify audio. Ask a blocking question before implementation: `这个视频需要我生成对应的配乐/音频吗？`
- `generate` — user explicitly wants music/audio/soundtrack, or answers yes after being asked.
- `none` — user explicitly wants silent video or no generated audio.
- `existing` — user provides or names an existing audio file to use.

Do not start audio generation when `audio_mode` is `ask`. Resolve the question first. Once `audio_mode` is `generate`, load `$atmos-audio-gen` and follow it for soundtrack design and verification.

If subagent tools are available and the video duration plus rough scene cue timings are known, audio generation may run in parallel with visual implementation. Give the subagent only the project path, duration, cue timings, intended mood, and the instruction to use `$atmos-audio-gen`; do not ask it to change visual composition files.

## Project Shape

Use this shape by default:

```text
marketing/creative/projects/<project-name>/
├── AGENTS.md
├── artifacts/
│   ├── audio/
│   ├── images/
│   └── videos/
├── hyperframes/
└── source/
    └── lottie/
```

Create only folders the project actually needs. Do not create `renders/` or `exports/` by default. `artifacts/` is the project output surface for generated video, image, and audio files. When Lottie is used, treat `source/lottie/` as the canonical checked-in source inside the marketing project and keep any HyperFrames runtime copy under `hyperframes/assets/lottie/`.

## Lottie + HyperFrames

Use `$text-to-lottie` when a scene needs reusable vector animation that should stay crisp at promo-video scale, especially for:

- logo or wordmark reveals
- typography-led interstitials or CTA lockups
- agent icon swarms, chips, and status glyphs
- lower thirds, caption bars, or notification-like overlays
- diagram traces, metric counters, and product-promo accent motion

Do not use Lottie as a default substitute for normal HyperFrames scene work. If the effect is just a screenshot pan, product-stage crop, card entrance, mask wipe, or a short text transition, build it directly in HyperFrames with HTML/CSS/JS first.

When using Lottie inside an Atmos video:

- Author and verify the animation with `$text-to-lottie` first. Respect its official-player workflow, `player-contract.md`, and routed references.
- After approval, copy the scene files needed for reuse into `<project>/source/lottie/<asset-name>/`. This usually includes `lottie.json`, optional `controls.json`, and any local image assets referenced by the JSON.
- Mirror only the files actually consumed at render time into `<project>/hyperframes/assets/lottie/<asset-name>/`. Treat this HyperFrames copy as a runtime asset, not the creative source of truth.
- Keep Lottie transparent by default for overlays and inserts. Use an opaque/full-frame Lottie background only when the beat is intentionally a standalone chapter card or type scene.
- Do not rely on native Lottie text for fixed marketing copy unless editable text is explicitly required and the chosen player path has verified font loading. Default to shape/vector text for headlines, labels, and CTA copy inside Lottie scenes.
- Keep Lottie short and purposeful. It should sharpen a beat, not run forever as decorative ambient motion over product proof.

## App Copy Rule

Apps cannot depend on `marketing/` files at runtime. If landing, web, docs, or another app needs a video or poster, copy the selected artifact into that app's public/static asset folder.

For landing videos, copy from:

```text
marketing/creative/projects/<project>/artifacts/videos/
marketing/creative/projects/<project>/artifacts/images/
```

to:

```text
apps/landing/public/videos/
```

Use project/descriptive filenames in `artifacts/`, such as `atmos-intro-16x9-1080p.mp4`. Use app-facing filenames in app public folders, such as `atmos-intro.mp4`.

## Atmos Creative Rules

- Include `ATMOS - Atmosphere for Agentic Builders` in Atmos intro, landing, and broad brand videos when it fits the sequence.
- Verify current brand assets before using any logo. Do not reuse stale project-local logos or the old deleted `logo.png`.
- Preserve product screenshots and asset colors. "Minimal" means restrained layout and palette, not black/white/gray desaturation.
- Avoid AI-looking visual noise: excessive rainbow palettes, decorative blobs, generic gradients, over-glossy cards, and busy effects.
- Keep the visual system premium and simple, but not dull. Use clear contrast, current product imagery, and enough color separation to avoid muddy yellow/brown or gray casts.
- Use real product states, screenshots, agent icons, and UI details where possible instead of abstract filler.
- When showing supported agents, include a representative broad set with logos/icons and a "more/all agents" idea when appropriate; do not imply support is limited to only a few agents.
- For closing CTA frames, include `https://atmos.land` and the GitHub link when the video is for landing or social promotion.
- Use Lottie as a precision tool for icon, type, logo, and diagram motion, not as an excuse to replace real product proof with abstract loops.

## Style Contract

For Atmos marketing, landing, launch, and social promo videos, treat these as reusable hard style requirements unless the user explicitly overrides them:

- Aim for simple, premium, product-led software motion. The result should feel like a polished developer tool promo, not a generic AI demo reel.
- Do not use a rainbow/multicolor AI palette, neon soup, generic purple-blue gradients, floating glow blobs, noisy particles, or over-decorated glass cards.
- Do not swing to pure black/white/gray minimalism. Keep screenshots and logos in their original color. The surrounding interface can be restrained, but product imagery must remain inspectable and true to source.
- Prefer a clear graphite base with blue/green accents and only small amber/brass highlights. Avoid muddy dark-yellow, brown, or low-contrast sepia casts.
- Use current Atmos brand language. If the current logo is unclear, use the current site wordmark/orbit-style mark direction or omit the logo; never resurrect old `logo.png` assets.
- Keep enough story density for a real promo. For a 30 second intro, a good baseline is about 6-8 scenes: brand/slogan, problem context, product positioning, multi-agent support, parallel/worktree/terminal workflow, review/preview, and CTA.
- For longer 60-110 second promos, plan about 14-24 beats with clear act breaks, proof scenes, and a final resolved CTA. Do not stretch a 30 second storyboard with slower fades.
- Do not shorten or delete important content just to make implementation easier. If the user asks for a full intro, preserve the narrative arc and adjust pacing instead.
- Show a broad agent support surface. Use icon + name chips/cards for many agents, not a short text-only list. Include a "More agents" or "supports more/all agents" moment when appropriate.
- Use existing agent icons in front of agent names where available. Missing icons should be handled intentionally, not by dropping the agent surface.
- Treat copy as edit rhythm: short, high-contrast headline cards and bottom caption pills can carry pacing, but every text beat must be paired with product proof or a meaningful transition.
- Use a proof-first frame mix: real app screens, terminal/worktree states, chat surfaces, notifications, calendars, browser windows, agent chips, and review/preview moments. Avoid long runs of abstract brand cards.
- Alternate frame families so the video feels designed: bright product stage, dark chapter card, dense UI proof, split workflow, phone/notification insert, agent/logo surface, and final CTA.
- If Lottie is used, keep it subordinate to the story: interstitial punctuation, overlay detail, or a short hero lockup beat. It must not turn the whole promo into a motion-graphics reel with thin product proof.
- Use varied scene choreography. Good options include focus pull, horizontal push, vertical reveal, shallow zoom, card/logo cascade, timeline/lane motion, subtle 3D flip, and staggered matrix reveal. Do not make every scene use the same fade/slide pattern.
- Keep final CTA practical: include `https://atmos.land` and GitHub side by side for public promo videos.

## Design Planning Gate

Before implementing a HyperFrames composition, write or update `DESIGN.md` with a storyboard table that includes `time`, `role`, `visual proof`, `headline/caption`, `motion`, and `source asset`. Use this to make the design inspectable before rendering.

Every storyboard should answer:

- What is the viewer supposed to understand at this beat?
- Which real product state proves it?
- What frame family is being used, and how is it different from the previous beat?
- What motion change makes the edit visible without turning into a gimmick?
- What asset is missing, and what faithful placeholder will be used until the real capture exists?

## Motion Rules

Use `$hyperframes` for exact composition rules, but enforce these Atmos-specific expectations:

- Vary scene motion. Do not reuse the same entrance/transition pattern for every scene.
- Keep transitions polished and visible, but avoid distracting gimmicks.
- Build enough content for the requested duration; do not shorten the story just to simplify implementation.
- Keep text readable at video resolution and avoid overlap on dense frames.
- Use product screenshots at their natural colors and frame them for inspection, not as blurred background decoration.
- Avoid hero/source assets that are purely atmospheric when the viewer needs to understand the product.
- Prefer designed edits over default fades: match cuts, quick scale punches, masked wipes, crop reveals, pan/zoom over product captures, and title-card contrast shifts.
- Layer Lottie inserts deliberately. Fade or wipe them in and out with the scene edit, and avoid leaving a looping Lottie asset pinned over the same proof frame for too long.
- Use bottom caption pills sparingly as a rhythm track for short narration, but keep them within a safe area and off the primary UI details.
- If a scene is mostly text, make the typography itself the composition: strong weight contrast, large scale, deliberate whitespace, and a clear entrance/exit gesture.

## Audio

Use `$atmos-audio-gen` only after `audio_mode` resolves to `generate`, or when revising existing generated music. Keep canonical generated audio in:

```text
marketing/creative/projects/<project>/artifacts/audio/
```

If HyperFrames needs an `<audio>` element for preview/lint, mirror the WAV into:

```text
marketing/creative/projects/<project>/hyperframes/assets/audio/
```

Treat that HyperFrames audio copy as generated and ignored. Do not create per-scene audio clips, pause/restart music between sections, or add cue-start stingers.

When `audio_mode` is `none`, do not add an `<audio>` clip or generate soundtrack artifacts. When `audio_mode` is `existing`, copy or reference the provided source according to the project's artifact rules and still verify muxing/continuity.

## Render Scripts

For custom local render scripts:

- Write MP4 artifacts to `<project>/artifacts/videos/`.
- Write poster/still artifacts to `<project>/artifacts/images/`.
- Read canonical audio from `<project>/artifacts/audio/`.
- Copy app deployment files directly from artifacts to the consuming app.
- Clean temporary frame directories after render.
- Keep `node_modules/`, `.render-frames/`, and mirrored preview audio ignored.

## Verification

Run the project-specific commands, usually from `<project>/hyperframes/`:

```bash
npm install
npm run check
npm run render
```

Run `npm run audio` before `npm run render` only when `audio_mode` is `generate` or when refreshing a generated soundtrack.

If available and stable, also run `npm run check:full`. If HyperFrames `validate` or `inspect` times out waiting for a Chrome WS endpoint, run `npx --yes hyperframes@<version> doctor` and use the local render script as the practical end-to-end verification.

After rendering, verify:

- Any Lottie scene used by the video was first validated and frame-checked in the official `$text-to-lottie` player workflow before being mirrored into the HyperFrames project.
- `ffprobe` reports expected duration, resolution, frame rate, and audio stream.
- App public copies match artifacts with `shasum -a 256`.
- Audio has no unintended mid-track silence with `silencedetect` when music is present.
- A 1fps contact sheet of the rendered video shows varied frame families, no long dead stretches, no repeated default fade/slide pattern, and enough real product proof to explain the offer without reading the source prompt.
- Lottie overlays render cleanly in HyperFrames with correct alpha, timing, scale, and no blank first frame, cropping, or missing referenced assets.
- `rg` finds no old paths such as `apps/landing/hyperframes`, `renders/`, or `exports/` in newly written project docs/scripts unless intentionally documenting a migration.
- No generated `node_modules/`, `.render-frames/`, mirrored preview audio, or throwaway Lottie workbench files are tracked.

## Final Response

Report the project path, artifact paths, any Lottie source/runtime asset paths, app public copies, commands run, and any warnings that remain. If app assets were copied, state clearly that the app deployable files are copies and `artifacts/` remains the creative source of truth.
