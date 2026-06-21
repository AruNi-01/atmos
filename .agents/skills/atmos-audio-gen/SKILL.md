---
name: atmos-audio-gen
description: Create or revise clean continuous audio beds for Atmos marketing and HyperFrames videos. Use when generating synthetic WAV background music, adding or replacing promo video music, muxing audio into landing page videos, or fixing issues like per-scene pause/play, cue-start stingers, chirpy bells, bird-like transition sounds, harsh high frequencies, or mid-track silence.
---

# Atmos Audio Gen

## Purpose

Create restrained, continuous app-promo soundtracks for Atmos videos. Pair this with `hyperframes` or `hyperframes-cli` when the video composition itself needs editing; this skill owns the audio design, generation, muxing, and verification rules.

## Workflow

1. Inspect the video timeline: total duration, scene/cue starts, visual energy, and whether the user wants pure music or music under voice.
2. Build one full-duration audio bed. Do not create separate audio clips per scene unless the user explicitly asks for source-editing of existing music.
3. Model scene changes with a cue map and smooth parameter interpolation: chord, pad, arp density, drum density, sub pulse, and shimmer.
4. Generate a WAV at the exact video duration, usually from `<video-project>/scripts/generate-audio.mjs` to `<video-project>/assets/audio/*.wav`.
5. Mux the WAV into the existing MP4 with video stream copy when visuals are already correct.
6. Verify duration, codec, mid-track continuity, and absence of transition stinger code before reporting completion.

## Sound Design Rules

- Keep the music continuous from start to finish, with only a global fade-in and fade-out.
- Make sections feel different through arrangement changes: fewer/more drums, denser arps, chord crossfades, sub movement, and slightly different shimmer.
- Use a premium app-promo arc: calm intro, gradual build, energetic feature middle, clean resolved close.
- Keep the palette minimal: warm pads, soft pulse, controlled sub, light percussion, and restrained shimmer.
- Let visual cuts and music cues align broadly, but avoid a point sound on every scene boundary.
- Preserve headroom. Normalize or scale to a target peak around `0.72` to `0.82`, then use a final limiter when encoding.

## Hard Avoids

- Do not add per-cue one-shot transition sounds. Avoid patterns named or shaped like `transitionLift`, `bellLayer`, `liftNoise`, `riser`, cue-level `bell`, sweep bursts, and chime hits.
- Do not stop, pause, or restart music for each segment. The listener should not hear the soundtrack resetting between scenes.
- Do not use high-pitched bells, chirps, bird-like tones, or sharp noise accents at cue starts.
- Do not make every transition sound identical. Prefer continuous crossfades and evolving instrumentation instead of repeated effects.
- Do not let shimmer or arps dominate the mix. High-frequency content should be subtle and continuous, not a foreground melody unless requested.

## JavaScript Synthesis Pattern

Use a cue map with continuous fields. A good cue shape is:

```js
const cues = [
  { name: "intro", start: 0, chord: [73.42, 110, 146.83, 220], pad: 0.9, arp: 0.05, drums: 0.05, shimmer: 0.25 },
  { name: "build", start: 4.0, chord: [58.27, 116.54, 174.61, 233.08], pad: 0.8, arp: 0.3, drums: 0.35, shimmer: 0.35 },
];
```

Use a `transitionSeconds` window of roughly `1.2` to `2.0` seconds and interpolate cue values with `smoothstep`. The final mono mix should look conceptually like this:

```js
const mono = (pad + arp + drums + sub + shimmer) * globalEnvelope(time);
```

Keep stinger-like layers out of the mix. If a layer only exists to fire around `cue.start`, remove it or redesign it as a continuous background layer.

## Atmos Project Conventions

- Put synthetic audio scripts beside the HyperFrames project, for example `apps/landing/hyperframes/<video>/scripts/generate-audio.mjs`.
- Output generated audio into `apps/landing/hyperframes/<video>/assets/audio/`.
- Add or use an `npm run audio` script for repeatable regeneration.
- When working in this repo, use `apps/landing/hyperframes/atmos-intro/scripts/generate-audio.mjs` as the current baseline for a continuous synthetic soundtrack.
- Publish final landing-page videos under `apps/landing/public/videos/`.

## Muxing

When the visual MP4 is already correct, replace only the audio track:

```bash
ffmpeg -y -i path/to/video.mp4 -i path/to/audio.wav \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 160k \
  -af afade=t=in:st=0:d=1.2,afade=t=out:st=<fade_start>:d=1.8,alimiter=limit=0.86 \
  -shortest path/to/video.with-audio.mp4
```

Set `<fade_start>` to `duration - fade_out_duration`, for example `28.2` for a 30 second video with a 1.8 second fade-out.

## Verification

Run these checks before finishing:

```bash
ffprobe -v error -show_entries format=duration,size \
  -show_entries stream=index,codec_name,codec_type,sample_rate,channels,width,height,r_frame_rate \
  -of default=nw=1 path/to/video.mp4
```

```bash
ffmpeg -hide_banner -nostats -i path/to/video.mp4 \
  -map 0:a:0 -af silencedetect=noise=-45dB:d=0.22 -f null -
```

Only start/end fade silence is acceptable unless the user requested silence. Mid-track silence usually means the audio is still segment-based or muxed incorrectly.

Also grep the generation script for known bad transition layers:

```bash
rg -n "transitionLift|bellLayer|liftNoise|riser|bell:" path/to/generate-audio.mjs
```

This grep should return no matches for Atmos promo background music unless there is a deliberate user-approved sound design reason.

## Final Response

Report the files changed, the final video path, the audio/video parameters, and whether the no-stinger and mid-track continuity checks passed. If verification was skipped, say why.
