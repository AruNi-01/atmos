# Brainstorm · APP-083: Mobile Token usage UI fixes

> Problem space and exploration. Follow-up to APP-082 (`#349`, merge `1e253cc3`). Found on the iOS simulator against `main`.

## Context

APP-082 shipped the mobile Token usage Computer scope and a Publish sheet that uses Expo UI `Host` + `Button`. Simulator review found the Publish controls unreadable, a light-mode heatmap overlap after changing Computer, glyphs that ignore theme changes, and chart press/label/scroll glitches.

Current workaround: none. The page is the only mobile Token usage surface.

## Goals (draft)

- Primary: Publish, heatmap, glyphs, and charts are usable in both themes after Computer / All / theme switches.
- Secondary: keep APP-082 data paths, WS actions, and share-capture behavior unchanged.

## Options

### Option A — Patch the Expo UI Host buttons in place

Keep `Host` + `Button`. Give each button `expoUiButtonHostStyle` + stretch modifiers. Stack Update/Publish full-width, Turn off below as danger outlined. Drop the outer Publish card. Wrap Handle/X/GitHub in `GlassPanel` capsules.

**Pros**: matches mobile button rules; no new primitive.
**Cons**: Expo UI `Host` sizing is still a footgun if a later change drops the stretch style.
**Unknown**: disabled `filled` + `tertiaryLabel` seed contrast on the real simulator.

### Option B — Replace Publish CTAs with RN `Pressable`

Paint primary/danger with RN views so we fully control size and color.

**Pros**: no Host collapse.
**Cons**: violates `apps/mobile` “buttons are Expo UI Host + Button”; doubles chrome.
**Unknown**: none worth the policy break.

### Option C — Defer visual bugs to a later polish spec

Ship data-scope only and file UI later.

**Pros**: smaller diff.
**Cons**: P1 Publish and heatmap bugs are already on `main`; the page is not usable.

## Key forks in the road

- **Fork 1**: Expo UI stretch buttons vs RN Pressable — decide in PRD. Land on Option A.
- **Fork 2**: Heatmap `LinearTransition` vs reserved height — decide in TECH.
- **Fork 3**: Bar popover stays only while pressing vs tap-to-open and persist — decide in PRD (tap must open; keep the vertical line).

## Open questions

- [x] iOS simulator verification in this environment — no. Record 未运行.
- [x] Outer Publish card — remove it (AruNi). Fields sit on the sheet background.
- [x] Input chrome — glass capsules, not the bordered control well from APP-082.

## References

- Existing code: `apps/mobile/src/features/token-usage/ShareSheet.tsx`, `TokenUsageScreen.tsx`, `charts.tsx`, `apps/mobile/src/features/terminal/agent-glyph-tint.ts`
- Related specs: `APP-082_mobile-token-usage`
- Merge: `#349` / `1e253cc3`. Review Host switch: `ff71b646e`

## Ready to promote

- Promote to PRD: Option A; no outer card; glass pill fields; full-width primary; Turn off below; heatmap must not overlap stats; glyphs follow color scheme; bar tap opens popover; x-axis first label visible; All must not tuck the large title under header buttons.
- Promote to TECH: Host stretch pattern, `LinearTransition` removal, Image remount key, chart inset/tap, NativeSwitch green seed.
