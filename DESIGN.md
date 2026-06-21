---
version: alpha
name: Atmos
description: Local-first agentic development cockpit with dense IDE-like chrome, native mobile surfaces, neutral color, precise borders, and status-driven accents.
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.141 0.005 285.823)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.141 0.005 285.823)"
  popover: "oklch(1 0 0)"
  popover-foreground: "oklch(0.141 0.005 285.823)"
  primary: "oklch(0.21 0.006 285.885)"
  primary-foreground: "oklch(0.985 0 0)"
  secondary: "oklch(0.955 0.002 286.375)"
  secondary-foreground: "oklch(0.21 0.006 285.885)"
  muted: "oklch(0.955 0.002 286.375)"
  muted-foreground: "oklch(0.552 0.016 285.938)"
  accent: "oklch(0.955 0.002 286.375)"
  accent-foreground: "oklch(0.21 0.006 285.885)"
  border: "oklch(0 0 0 / 10%)"
  destructive: "oklch(0.577 0.245 27.325)"
  info: "oklch(0.62 0.17 251)"
  success: "oklch(0.63 0.18 148)"
  warning: "oklch(0.72 0.16 79)"
  sidebar: "oklch(0.985 0 0)"
  sidebar-foreground: "oklch(0.141 0.005 285.823)"
  terminal-background: "#09090b"
  dark-background: "oklch(0.141 0.005 285.823)"
  dark-foreground: "oklch(0.985 0 0)"
  dark-card: "oklch(0.21 0.006 285.885)"
typography:
  title-xl:
    fontFamily: Geist Sans
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: 0
  title-lg:
    fontFamily: Geist Sans
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0
  body-md:
    fontFamily: Geist Sans
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: Geist Sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  label-sm:
    fontFamily: Geist Sans
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0
  caption:
    fontFamily: Geist Sans
    fontSize: 10px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0
  code-sm:
    fontFamily: Geist Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  terminal:
    fontFamily: Hack Nerd Font Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: 0
rounded:
  sm: 6px
  md: 8px
  lg: 10px
  xl: 14px
  full: 9999px
spacing:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  2xl: 20px
  3xl: 24px
  4xl: 32px
  header-height: 48px
  tabbar-height: 40px
  control-xs: 24px
  control-sm: 32px
  control-md: 36px
  control-lg: 40px
components:
  app-shell:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
  header:
    height: "{spacing.header-height}"
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    padding: "0 16px"
  sidebar:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.sidebar-foreground}"
  button-primary:
    height: "{spacing.control-md}"
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    typography: "{typography.body-md}"
  button-ghost:
    height: "{spacing.control-sm}"
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
  input:
    height: "{spacing.control-md}"
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    typography: "{typography.body-md}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.md}"
    padding: "16px"
  tooltip:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
    typography: "{typography.label-sm}"
  terminal-pane:
    backgroundColor: "{colors.terminal-background}"
    textColor: "#f4f4f5"
    typography: "{typography.terminal}"
  dark-shell:
    backgroundColor: "{colors.dark-background}"
    textColor: "{colors.dark-foreground}"
---

# Atmos DESIGN

This file is the design-system entrypoint for coding agents. It keeps the machine-readable tokens and the non-negotiable design direction. Detailed rules live in `agents/references/design/`.

## Design Identity

Atmos is a quiet cockpit and dense workbench for agentic software work. It should feel like a precise combination of an IDE, a terminal multiplexer, a Git client, and an agent control room.

Core traits:

- **Dense**: compact controls, short rows, tight lists, and panels that make full use of the screen.
- **Neutral**: black, white, gray, and low-chroma surfaces dominate; color is reserved for state and action.
- **Border-led**: hierarchy is created with 1px borders, tonal layers, and hover states rather than heavy shadows.
- **Tool-first**: terminals, editors, diffs, previews, and canvas surfaces are real tools, not decorative cards.
- **Native on mobile**: mobile shares Atmos product intent, but its controls and navigation should come from iOS and Android native systems.

## Documentation Map

- [Foundations](agents/references/design/foundations.md): colors, typography, layout, elevation, radius, and motion.
- [Components](agents/references/design/components.md): buttons, inputs, cards, tabs, sidebars, badges, tooltips, dialogs, terminal, canvas, and empty states.
- [Web And Desktop](agents/references/design/web-desktop.md): dense app shell rules for `apps/web` and Tauri Desktop.
- [Mobile](agents/references/design/mobile.md): native iOS/Android rules, Expo UI usage, iOS Liquid Glass, and Android native controls.

## Platform Routing

- Web/Desktop should follow the dense shell model: header, sidebars, center stage, right sidebar, resizable panels, tabs, terminal mosaic, editor, diff, preview, and canvas.
- Mobile should follow a native phone model: native navigation, native controls, stacked screens, grouped lists, sheets, one workspace at a time, and one terminal surface at a time.
- Share product tone and status semantics across platforms. Do not share chrome blindly.

## Non-Negotiables

- Use semantic theme tokens before raw color values.
- Do not make the app shell look like a landing page.
- Do not wrap terminal, editor, diff, preview, or canvas in decorative cards.
- Do not import `@workspace/ui` into mobile.
- Use native mobile controls for buttons, menus, lists, forms, inputs, pickers, switches, sheets, dialogs, settings rows, and navigation headers.
- On iOS, use system/native Liquid Glass surfaces where supported instead of hand-rolled glass effects.
- On Android, keep Android controls native; do not clone iOS glass.
- Keep text from overlapping icons, counters, row actions, or neighboring content.
