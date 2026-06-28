# Atmos Video Project Files

Use this reference when creating or revising a project under `marketing/creative/projects/<project>/`.

## Required Shape

```text
marketing/creative/projects/<project>/
├── AGENTS.md
├── artifacts/
│   ├── audio/
│   ├── images/
│   └── videos/
├── hyperframes/
│   ├── assets/
│   │   └── lottie/
│   ├── .gitignore
│   ├── DESIGN.md
│   ├── SCRIPT.md
│   ├── hyperframes.json
│   ├── index.html
│   ├── package.json
│   └── scripts/
│       └── render-video.mjs
└── source/
    └── lottie/
```

Create `hyperframes/scripts/generate-audio.mjs` only when `audio_mode=generate` or when revising generated audio with `$atmos-audio-gen`.
Create `source/lottie/` and `hyperframes/assets/lottie/` only when the video actually embeds approved Lottie scenes.

## File Responsibilities

- `AGENTS.md` at the project root: explain project purpose, commands, artifact paths, app copy targets, audio policy, and verification notes.
- `artifacts/audio/`: canonical generated or processed audio outputs.
- `artifacts/images/`: posters, still frames, thumbnails, and other image outputs.
- `artifacts/videos/`: canonical video outputs. Use descriptive filenames with aspect ratio and resolution.
- `source/`: optional raw captures, references, screenshots, or unedited media.
- `source/lottie/`: canonical checked-in Lottie assets approved for this marketing project. Store each reusable asset in its own folder with `lottie.json`, optional `controls.json`, and any referenced image files.
- `hyperframes/DESIGN.md`: project-specific visual contract. Include palette, typography, screenshot/color treatment, brand/logo constraints, motion feel, and "do not" rules.
- `hyperframes/SCRIPT.md`: scene plan. Include scene order, durations, visible copy, product moments, CTA, and rough audio cue timings if audio is needed.
- `hyperframes/index.html`: HyperFrames composition source. Use `$hyperframes` for exact composition and animation rules.
- `hyperframes/package.json`: local commands for preview/check/render. Keep project-local dependencies here, including any Lottie runtime dependency only when the composition actually embeds Lottie.
- `hyperframes/assets/lottie/`: optional runtime mirror of the Lottie files that HyperFrames needs at preview/render time. Do not treat this directory as the creative source of truth.
- `hyperframes/scripts/render-video.mjs`: reusable local Playwright plus FFmpeg render script. Project constants must be customized.
- `hyperframes/scripts/generate-audio.mjs`: audio-generation script owned by `$atmos-audio-gen`, not by this video skill.

## Script Reuse Rules

`render-video.mjs` is reusable as a template, not as a blind copy. Update these per project:

- project name and output filenames
- width, height, fps, and duration
- poster frame selection
- audio file path or no-audio behavior
- app copy targets, if any

`generate-audio.mjs` is not shared blindly between videos. Generate or revise it with `$atmos-audio-gen` because soundtrack length, cue timings, energy curve, and audio texture must match the specific video.

## Package Scripts

Use this baseline:

```json
{
  "scripts": {
    "dev": "npx --yes hyperframes@0.6.118 preview",
    "lint": "npx --yes hyperframes@0.6.118 lint",
    "validate": "npx --yes hyperframes@0.6.118 validate",
    "inspect": "npx --yes hyperframes@0.6.118 inspect",
    "check:scripts": "node --check scripts/render-video.mjs",
    "check": "npm run lint && npm run check:scripts",
    "check:full": "npm run lint && npm run validate && npm run inspect",
    "render": "node scripts/render-video.mjs"
  }
}
```

Add `"audio": "node scripts/generate-audio.mjs"` only when a generated audio script exists.

If the project embeds Lottie, keep the renderer setup local to the HyperFrames project. Do not hotlink CDN scripts in the composition.

## Git Ignore

Every HyperFrames project should ignore:

```text
node_modules/
.render-frames/
assets/audio/*.wav
```

The `assets/audio/*.wav` mirror exists only so HyperFrames preview/lint can resolve an `<audio>` element. The canonical audio file belongs in `artifacts/audio/`.

## Assets

Do not bundle Atmos logos or product screenshots inside this skill. Use current project/repo/source assets so the skill does not preserve stale branding. If a project needs local media for HyperFrames, put it under that project's `hyperframes/assets/` or `source/` as appropriate.

When a project uses `$text-to-lottie`, keep the approved scene files under `source/lottie/<asset-name>/` and mirror only the runtime-needed copy into `hyperframes/assets/lottie/<asset-name>/`. The official Lottie player project is the authoring workbench; the Atmos marketing project should keep its own checked-in source copy for reuse.
