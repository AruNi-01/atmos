# `react-native-screens@4.25.2` patch — keep

**Decision:** keep this patch. Removing it is **not** equivalent to any public `react-native-screens` / Expo Router API on the version we pin.

## What it does

On iOS 26.1+, `UISheetPresentationController` draws a Liquid Glass plate (plus a corner stroke) **above** the screen's `backgroundColor`. JS `contentStyle: { backgroundColor }` only paints the presented view, so the glass edge, flare-on-tap, and a fill that can snap to full height ahead of the present animation all stay.

The patch teaches v4 `RNSScreen` to install `sheet.backgroundEffect = [UIColorEffect effectWithColor:fill]` from the screen's opaque-enough `backgroundColor`:

1. From `updateFormSheetPresentationStyle` when the form sheet is configured.
2. From `updateBounds` only when `_controller.transitionCoordinator == nil`, so layout frames during the present animation do not reapply the effect and flash a full-height plate before the content.

Expo `@expo/ui` drawers already get the same solid plate through SwiftUI `presentationBackground(...)`. Native-stack `formSheet` routes have no equivalent hook without this patch.

## Why public API is not enough

Checked against `react-native-screens` **4.25.2** (pinned) and **4.30.0** (latest stable at evaluation):

| Approach | Result |
| --- | --- |
| `contentStyle.backgroundColor` / painting the root view | Color sits *behind* the glass. Upstream confirms this in [#4605](https://github.com/software-mansion/react-native-screens/issues/4605). |
| `scrollEdgeEffects: 'hidden'` | Unrelated; does not replace sheet material. |
| `sheetCornerRadius`, detents, grabber | Already set. None of these set `backgroundEffect`. |
| Bump to 4.30.0 (no major / Expo SDK jump) | Changelog has no form-sheet `backgroundEffect`. On `main`, `backgroundEffect` is still only nav-bar / tab-bar blur. |
| Proposed `sheetBackgroundEffect: 'automatic' \| 'color'` | **Not shipped.** Needs a screens release **and** a react-navigation / expo-router forward of the option. |
| Move form-sheet *routes* to `@expo/ui` `BottomSheet` | Different presentation path, not a screens public API. Out of scope. |

## Call sites that depend on it

These iOS `presentation: "formSheet"` routes set an opaque `contentStyle.backgroundColor` so the patch has a fill to copy:

- `apps/mobile/app/_layout.tsx` — `quota-settings`, `settings`, `sign-in`, `workspace-filters`, `workspaces`, `create-workspace`
- Nested stacks that keep the same fill: `apps/mobile/app/settings/_layout.tsx`, `apps/mobile/app/workspace-filters/_layout.tsx`, `apps/mobile/app/sign-in.tsx`

`ExpoDrawer` is a separate SwiftUI sheet and does **not** use this patch.

## Upstream tracking

- Issue (open): [software-mansion/react-native-screens#4605](https://github.com/software-mansion/react-native-screens/issues/4605) — formSheet Liquid Glass; `backgroundEffect` never set.
- PR (open, infer from opaque color): [software-mansion/react-native-screens#4986](https://github.com/software-mansion/react-native-screens/pull/4986)
- PR (open, explicit `sheetBackgroundEffect` prop; supersedes #4986): [software-mansion/react-native-screens#5007](https://github.com/software-mansion/react-native-screens/pull/5007)

Do not open a duplicate issue. #4605 is the same gap.

## Drop the patch when all of this is true

1. A `4.x` (or later, if Expo allows) release actually sets form-sheet `backgroundEffect`, either automatically or via a public prop such as `sheetBackgroundEffect: 'color'`.
2. Expo Router / `@react-navigation/native-stack` forwards that prop if it is not inferred.
3. Form-sheet routes opt into the solid fill (if the default stays Liquid Glass).
4. Present animation still keeps the fill with the sheet (our `transitionCoordinator == nil` guard). Re-check this even if #4986 / #5007 land — neither PR currently re-applies from `updateBounds`.
