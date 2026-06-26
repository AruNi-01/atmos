# atmos-intro-editorial Creative - AGENTS.md

> Atmos marketing video creative project.

---

## Contract

- Source project: `marketing/creative/projects/atmos-intro-editorial/`
- HyperFrames app: `hyperframes/`
- Artifacts: `artifacts/audio`, `artifacts/images`, `artifacts/videos`
- Target format: 1920x1080, 30fps, 42s
- Audio mode: `generate`

This project currently syncs deployable copies to the `landing` app target when the render script is configured for it.

---

## Commands

Run from `hyperframes/`:

```bash
npm install
npm run check
npm run render
```

Run `npm run audio` only after `audio_mode=generate` is confirmed and a generated audio script exists.

---

## Rules

- Use `$hyperframes` for composition and motion implementation.
- Use `$atmos-audio-gen` only when audio mode resolves to `generate`.
- Keep generated outputs under `artifacts/`.
- Copy app deployment files from artifacts into the consuming app; apps must not depend on `marketing/` at runtime.
- Keep the canonical source and generated outputs in this project; app public files are deployable copies only.
