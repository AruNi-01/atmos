# Atmos Intro Creative - AGENTS.md

> 30-second Atmos intro video used by the landing page and social promotion.

---

## Layout

```
marketing/creative/projects/atmos-intro/
├── artifacts/
│   ├── audio/                     # Generated soundtrack WAV
│   ├── images/                    # Generated posters/stills
│   └── videos/                    # Generated video files
└── hyperframes/                   # Video source composition and scripts
```

---

## Commands

Run commands from:

```
marketing/creative/projects/atmos-intro/hyperframes
```

Use:

```bash
npm install
npm run audio
npm run check
npm run render
```

`npm run render` writes the project artifacts and then copies the landing deployment files into `apps/landing/public/videos/`.

Use `npm run check:full` when the local HyperFrames Chrome validation environment is healthy and layout inspection is needed. If it times out while waiting for a Chrome WS endpoint, run `npx --yes hyperframes@0.6.118 doctor` and use `npm run render` as the practical end-to-end verification.

---

## Output Contract

Project artifacts:

```
marketing/creative/projects/atmos-intro/artifacts/audio/atmos-ambient.wav
marketing/creative/projects/atmos-intro/artifacts/videos/atmos-intro-16x9-1080p.mp4
marketing/creative/projects/atmos-intro/artifacts/images/atmos-intro-16x9-1080p-poster.jpg
```

Landing deployment copies:

```
apps/landing/public/videos/atmos-intro.mp4
apps/landing/public/videos/atmos-intro-poster.jpg
```

Do not edit the landing deployment copies directly. Update this creative project, render, and let the render script copy the deployment files from `artifacts/`.

---

## Audio

- Use `$atmos-audio-gen` for soundtrack generation and revision.
- Keep the generated soundtrack at `artifacts/audio/atmos-ambient.wav`.
- `npm run audio` also mirrors the WAV into `hyperframes/assets/audio/atmos-ambient.wav` so HyperFrames preview/lint can resolve the `<audio>` element. Treat `artifacts/audio/` as canonical; the HyperFrames mirror is generated and ignored.
- Avoid per-scene stingers, cue-start bells, risers, chirps, and music restarts.
- Verify the final MP4 has no mid-track silence unless intentionally requested.

---

## Social Variants

Use `artifacts/videos/` and `artifacts/images/` for channel-specific variants too. Encode the target channel, aspect ratio, or resolution in the filename instead of creating app-specific export folders.
