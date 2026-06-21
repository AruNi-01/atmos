# Marketing - AGENTS.md

> Creative production and distribution workspace for Atmos marketing assets.

---

## Directory Structure

```
marketing/
├── creative/       # Source projects and generated artifacts
└── distribution/   # Social copy, campaign notes, schedules, launch checklists
```

---

## Ownership

- `marketing/creative` owns production source files and generated artifacts.
- `marketing/distribution` owns channel planning, X/Threads copy, launch notes, and posting variants.
- `apps/*/public` owns deployable app copies only. Do not treat app public folders as the creative source of truth.

---

## Publishing Rule

When an app needs a marketing asset, copy the needed artifact into that app's public/static asset folder. Apps must not depend on files under `marketing/` at runtime because deployed app bundles only include their own public/static assets.

For landing videos, the deployable copy belongs in:

```
apps/landing/public/videos/
```

The source artifact remains under:

```
marketing/creative/projects/<project>/artifacts/
```

---

## Safety Rails

- Keep generated source projects out of `apps/` unless they are actual deployable applications.
- Do not create app-specific export folders inside creative projects by default.
- Do not move social-only drafts into app public folders.
- Do not edit app public copies directly when a source project exists; update the creative project artifact and copy it into the consuming app.
