---
version: alpha
name: Atmos
description: Local-first agentic development cockpit with dense IDE-like web/desktop chrome and a ChatGPT-style native mobile companion built from quiet white/black surfaces, generous rounded controls, and bottom-anchored actions.
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
mobile:
  colors:
    background: "#f4f4f6"
    sheet-background: "#f8f8f9"
    surface: "#ffffff"
    surface-elevated: "#ffffff"
    surface-subtle: "rgba(10, 10, 11, 0.05)"
    control: "#f8f8f9"
    control-elevated: "#ffffff"
    control-disabled: "rgba(10, 10, 11, 0.045)"
    control-border: "rgba(10, 10, 11, 0.10)"
    control-glass-tint: "rgba(255, 255, 255, 0.24)"
    foreground: "#111112"
    foreground-inverse: "#fafafa"
    secondary-foreground: "#52525b"
    tertiary-foreground: "#9a9aa1"
    accent: "#0a84ff"
    selection: "rgba(10, 132, 255, 0.24)"
    separator: "rgba(10, 10, 11, 0.08)"
    separator-strong: "rgba(10, 10, 11, 0.16)"
    glass-border: "rgba(10, 10, 11, 0.08)"
    glass-fallback: "rgba(255, 255, 255, 0.82)"
    glass-fallback-strong: "rgba(255, 255, 255, 0.96)"
    glass-tint: "rgba(255, 255, 255, 0.24)"
    dark-background: "#000000"
    dark-sheet-background: "#1c1c1e"
    dark-surface: "#2c2c2e"
    dark-surface-elevated: "#2c2c2e"
    dark-surface-subtle: "rgba(255, 255, 255, 0.08)"
    dark-control: "#2c2c2e"
    dark-control-elevated: "#3a3a3c"
    dark-control-disabled: "#343436"
    dark-control-border: "rgba(255, 255, 255, 0.035)"
    dark-control-glass-tint: "rgba(58, 58, 60, 0.38)"
    dark-foreground: "#f5f5f7"
    dark-foreground-inverse: "#111112"
    dark-secondary-foreground: "#8e8e93"
    dark-tertiary-foreground: "#69696f"
    dark-accent: "#0a84ff"
    dark-selection: "rgba(10, 132, 255, 0.28)"
    dark-separator: "rgba(255, 255, 255, 0.10)"
    dark-separator-strong: "rgba(255, 255, 255, 0.16)"
    dark-glass-border: "rgba(255, 255, 255, 0.08)"
    dark-glass-fallback: "rgba(44, 44, 46, 0.94)"
    dark-glass-fallback-strong: "rgba(58, 58, 60, 0.92)"
    dark-glass-tint: "rgba(58, 58, 60, 0.28)"
  rounded:
    surface: 24px
    control: 28px
    dock: 9999px
  controls:
    input-height: 56px
    primary-button-min-height: 52px
    prompt-dock-min-height: 62px
  layout:
    screen-padding: 18px
    section-gap: 20px
    hero-top-padding: 56px
    bottom-action-padding: "10px 18px 16px"
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
  mobile-screen:
    backgroundColor: "{mobile.colors.background}"
    textColor: "{mobile.colors.foreground}"
    typography: "native system"
  mobile-sheet-screen:
    backgroundColor: "{mobile.colors.sheet-background}"
    darkBackgroundColor: "{mobile.colors.dark-sheet-background}"
    textColor: "{mobile.colors.foreground}"
    darkTextColor: "{mobile.colors.dark-foreground}"
  mobile-grouped-surface:
    backgroundColor: "{mobile.colors.surface}"
    rounded: "{mobile.rounded.surface}"
    borderColor: "{mobile.colors.separator}"
    iosMaterial: "none; use a plain View or Pressable surface, not GlassPanel"
  mobile-dark-grouped-surface:
    backgroundColor: "{mobile.colors.dark-surface-elevated}"
    borderColor: "{mobile.colors.dark-glass-border}"
    iosMaterial: "none; keep cards plain and visibly lighter than the black page background"
  mobile-control-surface:
    backgroundColor: "{mobile.colors.control}"
    darkBackgroundColor: "{mobile.colors.dark-control}"
    borderColor: "{mobile.colors.control-border}"
    darkBorderColor: "{mobile.colors.dark-control-border}"
    tintColor: "{mobile.colors.control-glass-tint}"
    darkTintColor: "{mobile.colors.dark-control-glass-tint}"
    iosMaterial: "none for text inputs; GlassPanel only for buttons, segmented controls, switches, and floating controls"
  mobile-primary-button:
    minHeight: "{mobile.controls.primary-button-min-height}"
    rounded: "{mobile.rounded.control}"
    backgroundColor: "{mobile.colors.foreground}"
    textColor: "{colors.primary-foreground}"
  mobile-header-icon-button:
    style: "icon-only native header item"
    ios: "unstable_headerRightItems / unstable_headerLeftItems with SF Symbols"
    android: "Pressable icon fallback or native menu icon"
  mobile-segmented-control:
    minHeight: 44px
    rounded: "{mobile.rounded.control}"
    iosMaterial: "GlassPanel track, low-lift selected pill"
  mobile-prompt-dock:
    minHeight: "{mobile.controls.prompt-dock-min-height}"
    rounded: "{mobile.rounded.dock}"
    backgroundColor: "{mobile.colors.background}"
    borderColor: "{mobile.colors.separator}"
---

# Atmos DESIGN

This file is the design-system entrypoint for coding agents. It keeps the machine-readable tokens and the non-negotiable design direction. Detailed rules live in `agents/references/design/`.

## Design Identity

Atmos is a quiet cockpit and dense workbench for agentic software work on Web/Desktop, with a simpler native mobile companion for remote Atmos Computer workflows.

Core traits:

- **Dense**: compact controls, short rows, tight lists, and panels that make full use of the screen.
- **Neutral**: black, white, gray, and low-chroma surfaces dominate; color is reserved for state and action.
- **Border-led**: hierarchy is created with 1px borders, tonal layers, and hover states rather than heavy shadows.
- **Tool-first**: terminals, editors, diffs, previews, and canvas surfaces are real tools, not decorative cards.
- **Native on mobile**: mobile shares Atmos product intent, but its visual reference is the ChatGPT iOS app: white/black surfaces, sparse typography, large rounded inputs, bottom prompt/action docks, and native navigation.

## Documentation Map

- [Foundations](agents/references/design/foundations.md): colors, typography, layout, elevation, radius, and motion.
- [Components](agents/references/design/components.md): buttons, inputs, cards, tabs, sidebars, badges, tooltips, dialogs, terminal, canvas, and empty states.
- [Web And Desktop](agents/references/design/web-desktop.md): dense app shell rules for `apps/web` and Tauri Desktop.
- [Mobile](agents/references/design/mobile.md): ChatGPT-style native mobile rules, Expo UI usage, bottom action docks, iOS Liquid Glass, and Android native controls.

## Platform Routing

- Web/Desktop should follow the dense shell model: header, sidebars, center stage, right sidebar, resizable panels, tabs, terminal mosaic, editor, diff, preview, and canvas.
- Mobile should follow a native phone model with ChatGPT-style simplicity: native navigation, native controls, iOS Liquid Glass where available, white/black fallback surfaces, generous rounded inputs and bottom action bars, stacked screens, grouped lists, sheets, one workspace at a time, and one terminal surface at a time.
- Share product tone and status semantics across platforms. Do not share chrome blindly.

## Non-Negotiables

- Use semantic theme tokens before raw color values.
- Do not make the app shell look like a landing page.
- Do not wrap terminal, editor, diff, preview, or canvas in decorative cards.
- Do not import `@workspace/ui` into mobile.
- Use native mobile controls for buttons, menus, lists, forms, inputs, pickers, switches, sheets, dialogs, settings rows, and navigation headers.
- Mobile may use large radius, pill-shaped controls, floating prompt docks, and sparse white space even when Web/Desktop guidance asks for modest radius and dense layouts.
- On iOS, use system/native Liquid Glass surfaces wherever supported for controls, sheets, and floating chrome instead of hand-rolled glass effects; grouped content cards stay plain.
- On Android, keep Android controls native; do not clone iOS glass.
- Keep text from overlapping icons, counters, row actions, or neighboring content.
