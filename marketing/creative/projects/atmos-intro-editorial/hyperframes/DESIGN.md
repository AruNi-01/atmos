# Atmos Intro Editorial Design

## Style Prompt

ATMOS should feel like an editorial product film for agentic builders: precise, premium, simple, and proof-led. The system alternates dark graphite chapter cards with bright product proof stages, keeping screenshots and agent logos in their original colors. Motion is brisk but controlled: push edits, crop reveals, focus pulls, matrix cascades, and short caption pills that behave like an edit rhythm rather than narration.

## Reference Translation

Reference video inspected from `/Users/lurunrun/Downloads/593884589-0a33365f-b786-48b5-9ed6-f8af7927bccb.webm`.

- Reusable grammar: bold opening type, early product proof, dark chapter resets, dense white-stage UI proof, bottom caption pills, phone/notification-style inserts, montage escalation, and practical CTA.
- Not reused: reference brand, mascot, copy, color marks, exact shot order, or product-specific screen content.
- Atmos adaptation: replace mascot/ops proof with Atmos orbit mark, agent matrix, terminal/worktree lanes, review/preview panels, and current Atmos product screenshots.

## Approach Decision

- Chosen: editorial proof-led product film. This best matches the user's request for premium, simple, product-led motion with proof density and rhythm.
- Rejected: abstract gradient slideshow. It would be easier to render but would fail the product-proof requirement and look like generic AI creative.
- Rejected: pure cinematic brand film. It would create atmosphere but under-serve the developer audience that needs to see multi-agent, worktree, terminal, review, and preview workflows.

## Palette

- Graphite canvas: `#080b10`
- Deep panel: `#101722`
- Light stage: `#f4f2ea`
- Ink: `#111722`
- Off-white text: `#f6f3ea`
- Muted text: `#aeb8c8`
- Hairline: `#263653`
- Blue accent: `#63a7ff`
- Green state: `#63d89a`
- Amber focus: `#e5b75f`
- Red diff: `#ff5f64`

Avoid purple-blue gradients as a primary visual identity. Purple may appear only inside preserved product screenshots, never as the surrounding video palette.

## Typography

- Display / wordmark: `Geist Pixel Square`, uppercase, heavy scale, letter spacing `0`.
- Interface / captions: `Geist Mono`, medium to bold, tabular numbers.
- Text must be readable at 1080p: headlines 64px+, captions 24px+, data labels 18px+.
- No Inter/Roboto defaults, decorative serif, gradient text, or squeezed tracking.

## Product And Asset Treatment

- Product screenshots in `assets/product/` stay in original color and are cropped/framed for inspection.
- Agent icons in `assets/agents/` are shown before labels where assets exist.
- Synthetic UI overlays are faithful product proof diagrams: worktree lanes, terminal sessions, review/preview states, and CTA proof panels. They should look like product surfaces, not abstract decoration.
- Atmos logo treatment uses the current orbit-style mark direction from `apps/landing/src/app/icon.svg` rebuilt in CSS/SVG, not stale PNG logos.

## Motion Rules

- Primary transition: editorial push / crop reveal, 0.35-0.55s.
- Accent transitions: dark shutter card, focus pull, matrix cascade, and quick scale punch.
- Every scene has entrance animations; outgoing scene content remains visible until the transition covers it.
- Keep one ambient motion per scene at most: crop pan, screenshot scale, lane drift, or subtle camera tilt.
- No looping infinite animation, particle fields, decorative blobs, or generic HUD noise.

## Storyboard

| Time | Role | Visual proof | Headline-caption | Motion | Source asset |
|------|------|--------------|------------------|--------|--------------|
| 0.0-4.2 | Hook typography + proof hint | Orbit mark, small terminal and changes strips, product screenshot edge | `ATMOS` / `Atmosphere for Agentic Builders` | Wordmark scale punch, proof strips slide on rails, focus pull into next beat | CSS orbit mark, `assets/product/atmos_preview_2.png` |
| 4.2-7.4 | Dark chapter card | Three terminal prompts and worktree paths as proof fragments | `Agents went parallel.` / `Your workspace should too.` | Shutter-to-graphite transition, staggered prompt reveal, amber cursor blink without loop | CSS terminal fragments |
| 7.4-12.6 | Product proof stage | Full Atmos workspace screenshot with terminal, sidebar worktrees, changes panel | `One control room for agentic work.` | Bright stage push, slow crop pan, callout pills for terminal/worktree/changes | `assets/product/atmos_preview_2.png` |
| 12.6-17.6 | Agent surface | Broad matrix of agent icon chips tied to built-in terminal agent manifest | `Bring the agents you already use.` | Matrix cascade, icon/name chips settle into columns, "more agents" tile lands last | `assets/agents/*`, `resources/terminal-agents/builtin_agents.json` |
| 17.6-23.4 | Split workflow | Three parallel lanes: feature, bugfix, refactor, each with worktree + agent + status | `Parallel worktrees stay visible.` | Horizontal push, lanes reveal left-to-right, progress bars advance once | CSS workflow lanes + agent icons |
| 23.4-28.8 | Terminal proof | Large terminal card, command history, model/status bar, file context | `Terminals keep the context of the work.` | Dark focus pull, terminal text mask reveal, bottom caption pill snaps in | CSS terminal card based on product screenshot |
| 28.8-35.0 | Review + preview proof | Split review panel, diff stats, preview browser card, publish path | `Review, preview, publish without switching tools.` | Diagonal split reveal, diff rows cascade, preview card shallow zoom | CSS review/preview panels, screenshot color references |
| 35.0-38.8 | Product proof montage | Cropped product screenshot, changes count, running agent state, preview badge | `Proof stays inspectable.` | Three proof panels lock into editorial grid, captions tick once | `assets/product/atmos_preview.png`, CSS proof panels |
| 38.8-42.0 | CTA | Atmos mark, URL, GitHub link, two small proof panels | `ATMOS` / `Open-source workspace for agentic builders` / `https://atmos.land` / `https://github.com/AruNi-01/atmos` | Calm bright resolve, URL/GitHub slide in side by side, final micro fade only | CSS orbit mark, product crops |

## What Not To Do

- Do not copy the supplied reference video's mascot, brand, copy, color identity, or shot order.
- Do not use rainbow AI palettes, generic purple-blue gradients, glow blobs, or pure grayscale minimalism.
- Do not graywash screenshots or agent logos.
- Do not make the video a sequence of abstract cards; product proof must reappear throughout.
- Do not create deployment-only assets as the source of truth. Canonical artifacts stay in `artifacts/`.
