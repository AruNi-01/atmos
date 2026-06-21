# Design Foundations

Atmos uses a quiet, dense, neutral visual system. It should feel precise and operational rather than decorative.

## Colors

Atmos does not use a bright brand color as its primary identity. The product identity comes from neutral surfaces, precise contrast, and status-driven accent color.

Neutral surfaces:

- `background`: main app background.
- `foreground`: strong text and core icons.
- `muted`, `secondary`, and `accent`: hover states, low-emphasis containers, and secondary controls.
- `border`: panel divisions, row separation, and control boundaries.
- `sidebar`: subtle layer for navigation and contextual panels.

Status colors:

- Success and diff additions use green.
- Warning, modified files, and favorites use amber.
- Info, review, and neutral progress use blue.
- Destructive actions use red.

Rules:

- Use neutral tokens for the UI skeleton.
- Use `primary` only for the strongest local action.
- Do not introduce decorative gradients, glows, or one-off saturated panels.
- Status colors must carry real state.
- Status chips should usually use tinted backgrounds at 5-15% opacity.
- Terminal content keeps its own near-black surface `#09090b`, even in light mode.

## Typography

Atmos uses Geist Sans for UI, Geist Mono for code and metadata, and Hack Nerd Font Mono for terminal content.

Scale:

- Settings title: 28px / 600 / 1.15.
- Workspace or overview title: 20px / 600 / 1.2.
- Panel title: 12-13px / 500-600.
- Default UI body: 13-14px / 400.
- Dense row text: 11-13px.
- Caption, badge, and metadata: 10-11px.
- Code, path, time, and command metadata: 10-12px monospace.
- Terminal: 13px Hack Nerd Font Mono.

Rules:

- Keep letter spacing at `0` by default.
- Do not use negative tracking.
- Use monospace for paths, branch names, timestamps, token counts, shortcut hints, and line-oriented data.
- Long paths and file names must truncate with tooltip access to full content.
- Do not use hero-scale typography inside app chrome, panels, cards, sidebars, or tool surfaces.

## Layout

Atmos uses a full-viewport, no-body-scroll layout on Web/Desktop. Mobile uses native stacked screens.

Shared metrics:

- Header height: 48px.
- Center tab bar height: 40px.
- Default controls: 36px.
- Small controls: 32px.
- Extra-small controls: 24px.
- Panel borders: 1px.
- Dense panel gutters: 8-16px.
- Settings modal content padding: 24-32px.

Rules:

- Major work surfaces fill available space.
- Do not center a tool inside a decorative card.
- Use fixed heights for toolbar rows, tab rows, icon buttons, counters, and split handles.
- On narrow widths, reduce columns before reducing text to unreadable sizes.

## Elevation And Depth

Atmos is mostly flat. Depth is created by borders, tonal contrast, and subtle overlays.

Rules:

- Primary layer: `bg-background` with `border-border`.
- Secondary layer: `bg-muted/20` to `bg-muted/40`.
- Hover layer: `bg-accent` or `bg-muted/50`.
- Popovers: border plus medium shadow.
- Dialogs: `black/50` overlay, border, and large but soft shadow.
- Drag overlays: border plus shadow, never a heavy card shadow.
- Terminal panes and mosaic windows: no outer shadow, no decorative radius, no card feel.

## Shapes

Atmos uses modest radius. The system root radius is 10px, but operational UI should usually stay tighter.

Radius scale:

- 2px: tiny arrows, tooltip arrow corners, terminal or canvas micro affordances.
- 6px: small controls, close buttons, dense rows.
- 8px: default buttons, inputs, sidebar rows, compact cards.
- 10px: dialogs, popovers, larger controls.
- 14px: shared generic card primitive or larger modal surfaces.
- 9999px: badges, chips, avatars, and true circular controls.

Rules:

- Prefer `rounded-md` for buttons, inputs, toolbar controls, rows, and compact cards.
- Use pill radius only for badges, chips, avatars, and true circular icon buttons.
- Avoid large rounded marketing cards in the app shell.
- Splitters, terminal panes, editor areas, and canvas surfaces should feel precise and rectangular.

## Motion

Motion should clarify state changes, not decorate static UI.

Rules:

- Small control motion should usually stay within 150-300ms.
- Large layout transitions can use 300-500ms.
- Motion must not cause layout jumps.
- Loading and agent activity animations should be clear but restrained.

