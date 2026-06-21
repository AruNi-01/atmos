# Atmos Audio Project Files

Use this reference when adding or revising generated soundtrack audio for a project under `marketing/creative/projects/<project>/`.

## Required Shape

Only create these files after `audio_mode=generate` is explicit.

```text
marketing/creative/projects/<project>/
├── artifacts/
│   └── audio/
│       └── <project>-soundtrack.wav
└── hyperframes/
    ├── assets/
    │   └── audio/
    │       └── <project>-soundtrack.wav
    ├── package.json
    └── scripts/
        └── generate-audio.mjs
```

`artifacts/audio/` is canonical. `hyperframes/assets/audio/` is only a preview/lint mirror for HyperFrames compositions that need an `<audio>` element.

## File Responsibilities

- `hyperframes/scripts/generate-audio.mjs`: deterministic local synthesis script for one full-duration WAV.
- `artifacts/audio/*.wav`: canonical generated soundtrack output.
- `hyperframes/assets/audio/*.wav`: generated mirror copy for local preview. It should be ignored by Git.
- `hyperframes/package.json`: add `"audio": "node scripts/generate-audio.mjs"` and include the script in syntax checks.

## Script Reuse Rules

`generate-audio.mjs` is reusable as a pattern, not as a blind copy. Update these per video:

- `durationSeconds`
- `outputFileName`
- `bpm`
- cue names and start times
- chord sets and section energy values
- global fade timings
- target peak

Do not create separate files per scene. Do not trigger one-shot sounds at cue starts. Section changes must happen through continuous interpolation of arrangement values such as `pad`, `arp`, `drums`, `sub`, and `shimmer`.

## Cue Map Rules

Use a single ordered cue map:

```js
const cues = [
  { name: "intro", start: 0, chord: [73.42, 110, 146.83, 220], pad: 0.9, arp: 0.05, drums: 0.05, sub: 0.14, shimmer: 0.24 },
  { name: "build", start: 4.0, chord: [58.27, 116.54, 174.61, 233.08], pad: 0.82, arp: 0.28, drums: 0.35, sub: 0.28, shimmer: 0.3 }
];
```

Keep cue transitions smooth with a `transitionSeconds` window around `1.2` to `2.0` seconds. Avoid any layer that exists only because `time` is near a cue boundary.

## Package Script Patch

When audio is generated, the HyperFrames package should include:

```json
{
  "scripts": {
    "audio": "node scripts/generate-audio.mjs",
    "check:scripts": "node --check scripts/generate-audio.mjs && node --check scripts/render-video.mjs"
  }
}
```

If the project has no `render-video.mjs`, keep `check:scripts` limited to the audio script.

## Verification

Run these checks after generation:

```bash
node --check hyperframes/scripts/generate-audio.mjs
npm run audio
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,codec_type,sample_rate,channels -of default=nw=1 artifacts/audio/<file>.wav
ffmpeg -hide_banner -nostats -i artifacts/audio/<file>.wav -af silencedetect=noise=-45dB:d=0.22 -f null -
rg -n "transitionLift|bellLayer|liftNoise|riser|bell:" hyperframes/scripts/generate-audio.mjs
```

The final `rg` command should return no matches unless the user explicitly approved that sound design. `silencedetect` should not report mid-track silence for background music; start/end fades are acceptable.

When the video already exists, mux with video stream copy so correct visuals are not re-rendered unnecessarily.

## Assets

Do not include audio samples, loops, or fixed brand sound files inside this skill. This skill generates synthetic audio locally. If a user supplies external music or source audio, place it in the project's `source/` folder and keep generated or processed outputs in `artifacts/audio/`.
