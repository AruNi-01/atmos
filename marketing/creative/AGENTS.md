# Marketing Creative - AGENTS.md

> Source workspace for reusable Atmos marketing creative: videos, audio, images, screenshots, and generated artifacts.

---

## Project Layout

Each creative project should live under:

```
marketing/creative/projects/<project-name>/
├── AGENTS.md
├── artifacts/            # Generated project outputs
│   ├── audio/
│   ├── images/
│   └── videos/
├── brief.md              # Optional creative brief or objective
├── hyperframes/          # HyperFrames source app when the project is video
└── source/               # Optional raw captures, references, unedited media
```

Create only the folders a project actually needs. For video projects, prefer this shape so source, generated artifacts, and app deployment copies do not blur together.

---

## Artifact Rules

- `artifacts/` contains generated outputs from the project: video, audio, images, posters, screenshots, and channel-specific variants if needed.
- Keep artifacts channel-neutral by default. Encode use case, aspect ratio, or resolution in the filename when needed.
- App deploy copies are separate from artifacts and must be copied into the consuming app's public/static folder.
- For landing page video assets, copy the needed artifact into `apps/landing/public/videos/`.

---

## HyperFrames

For HyperFrames projects:

- Keep the HyperFrames app under `<project>/hyperframes/`.
- Run commands from the `hyperframes/` directory.
- Use `$hyperframes` for composition edits and `$atmos-audio-gen` for synthetic promo music.
- Keep generated audio in `<project>/artifacts/audio/`, not inside the app's public deployment folder.
- Local render scripts should write artifacts first, then copy only the required app deployment files.

---

## Naming

- Use lowercase kebab-case project names, e.g. `atmos-intro`.
- Include aspect ratio and resolution in artifact filenames, e.g. `atmos-intro-16x9-1080p.mp4`.
- Use app-facing filenames only in app public folders, e.g. `atmos-intro.mp4`.
