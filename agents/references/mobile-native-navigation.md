# Mobile Native Navigation

Rules for `apps/mobile` page titles, headers, navigation bars, and navigation buttons. These rules exist to keep the Expo app aligned with native iOS behavior and to avoid regressions where titles disappear, headers look web-like, or navigation chrome is duplicated.

## Route Titles

- Use native stack titles. A route must set its page title through `Stack.Screen` options, not by rendering a title `<Text>` in the page body.
- Use `src/ui/navigation/native-screen-options.ts`:
  - `nativeLargeTitleOptions("Title")` for dashboard, settings, setup, picker, and form-sheet pages that should use iOS large-title collapse.
  - `nativeCompactTitleOptions("Title")` for detail/workspace/terminal surfaces that should stay compact and centered.
- Do not use a custom `Stack.Title` wrapper unless the current Expo Router version and runtime behavior are re-verified on iOS. Prefer the supported native-stack options path.
- Do not fake the iOS scroll behavior by always centering a custom title. The correct behavior is native large title at rest, then native inline title after scroll.

## Large-Title Header Behavior

- Large-title routes must let `react-native-screens` own the header:
  - The first rendered screen content should be `AppScreen` or a direct `ScrollView`.
  - That scroll view must use `contentInsetAdjustmentBehavior="automatic"`.
  - Do not wrap the first scroll view in another `View`, `GlassContainer`, provider, or layout component inside the route.
- `AppScreen` is the preferred shell for normal mobile pages because it exposes a first-child `ScrollView` and keeps header insets native.
- Do not set global `headerTransparent: false` or global `headerStyle: { backgroundColor: ... }` for large-title pages. On iOS 26 this can make native large titles or collapsed inline titles disappear.
- Keep page background on the content/screen surface (`contentStyle`, `ScrollView`, app background), not by forcing a header background on all screens.
- Avoid custom top padding for native headers. If a page belongs to a stack, rely on the stack header and automatic scroll insets.

## Compact Headers

- Use compact headers for workspace/detail/development surfaces where a persistent large title wastes vertical space.
- Compact screens should use `nativeCompactTitleOptions(...)`, which keeps a native centered title and allows an explicit background.
- Workspace detail should use the native stack back affordance with `headerBackButtonDisplayMode: "minimal"`; do not render a body-level Back button.
- Header actions on compact screens should be native header actions or menus, not floating buttons inside the page content.

## Header Buttons And Menus

- Header buttons are navigation chrome. Prefer native/Expo UI wrappers from `src/ui/primitives/native-controls`.
- For simple header actions, use `NativeButton` with the text/navigation variant already used by the app.
- For menus, use `NativeMenuButton` with native icons:
  - iOS icons should be SF Symbols (`systemImage`).
  - Android icons should use app assets under `assets/icons`.
- Keep icon-only header buttons visually centered and sized by the native wrapper. Do not build circular glass buttons manually in page content to mimic header buttons.
- Do not put business action buttons in the header unless they are route-level navigation or menu actions. Business actions inside cards/forms can use app-styled black/white buttons.

## Navigation Bars And Bottom Tabs

- Do not duplicate native navigation bars with custom page-body bars.
- Bottom navigation for workspace tabs must stay outside the terminal surface and should use the established workspace tab component/native glass treatment.
- A bottom tab/segmented control should have one visible container: avoid wrapping a native capsule in another card-like container.
- Selected state may have a different background; unselected state should stay visually quiet and match the app's black/white minimalist palette.
- Do not put terminal shortcut buttons inside the terminal renderer. Terminal shortcuts belong above the keyboard and should appear only while the keyboard is visible.

## Form Sheets And Modals

- Use Expo Router `presentation: "formSheet"` on iOS for sheet routes. Do not layer a custom bottom sheet inside a native sheet.
- Sheet routes should follow the same title rules as normal routes: native title via `Stack.Screen` options, no custom top title text.
- Sheet content should use `AppScreen` unless the screen has a strong reason for a custom scroll container.

## Review Checklist

Before finishing a mobile navigation/header change:

- Confirm every changed route has a native `Stack.Screen` title option.
- Confirm large-title pages use `nativeLargeTitleOptions(...)` and compact pages use `nativeCompactTitleOptions(...)`.
- Confirm the first screen content for large-title pages is `AppScreen` or a direct `ScrollView` with automatic inset adjustment.
- Confirm no global header background or `headerTransparent: false` was added for large-title pages.
- Confirm there is no body-level page title, fake header, custom Back text, or duplicate sheet.
- Run `bun --filter @atmos/mobile typecheck`.
