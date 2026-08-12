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

- Header buttons are navigation chrome. On iOS, route header actions should use native-stack header items (`unstable_headerRightItems` / `unstable_headerLeftItems`) so the system owns bar-button material, hit testing, and large-title behavior.
- Do not place `@expo/ui` `Host`/`Button` product CTAs inside iOS `headerRight`; business-button styling can render as an opaque gray pill in the navigation bar. Keep product CTAs in the screen body, not the navigation bar.
- Header actions must be icon-only in the visible navigation bar. Do not show visible text labels such as `Refresh`, `New`, `Import`, `Save`, or `Done` as header buttons. Put text in accessibility labels, menus, or body actions instead.
- For menus, use `NativeMenuButton` with native icons:
  - iOS icons should be SF Symbols (`systemImage`).
  - Android icons should use app assets under `assets/icons`.
- For iOS navigation-bar button groups or header menus, prefer Expo Router/native-stack `unstable_headerRightItems` / `unstable_headerLeftItems` over rendering React Native views or Expo UI SwiftUI views in `headerRight`:
  - Use `type: "menu"` header items for native `UIMenu` popovers anchored to the bar button.
  - Use `sharesBackground: true`, `variant: "plain"`, and a shared `tintColor` when multiple iOS 26 bar buttons should share one liquid-glass capsule.
  - Use SF Symbols via `icon: { type: "sfSymbol", name: "..." }`; do not draw text glyphs such as `>_` for header icons.
  - Put selected menu state on native menu actions with `state: "on" | "off"` instead of custom checkmarks.
  - Keep the menu trigger itself enabled whenever it can show a useful disabled/loading menu item; do not make the whole bar item unclickable just because its data is still loading.
  - Do not use `ActionSheetIOS` for header button menus that should behave like a popover next to the button.
  - Do not place `@expo/ui/swift-ui` `ControlGroup`, `Menu`, `GlassView`, `Pressable`, or hand-rolled capsule backgrounds inside React Navigation `headerRight` for iOS grouped header menus; in this stack they can render with extra gray material, duplicate backgrounds, or lose touch handling.
- Keep icon-only header buttons visually centered and sized by the native wrapper. Do not build circular glass buttons manually in page content to mimic header buttons.
- Do not put business action buttons in the header unless they are route-level navigation or menu actions. Business actions inside cards/forms can use app-styled black/white buttons.

## Navigation Bars And Bottom Tabs

- Do not duplicate native navigation bars with custom page-body bars.
- Bottom navigation for workspace tabs must stay outside the terminal surface and should use the established workspace tab component/native glass treatment.
- A bottom tab/segmented control should have one visible container: avoid wrapping a native capsule in another card-like container.
- Selected state may have a different background; unselected state should stay visually quiet and match the app's black/white minimalist palette.
- Do not put terminal shortcut buttons inside the terminal renderer. Terminal shortcuts belong in the native mobile chrome outside the WebView/DOM terminal surface, with the terminal background continuing behind the toolbar.

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
- Confirm iOS grouped header menus use `unstable_headerRightItems` / `unstable_headerLeftItems` native bar button items, not a custom `headerRight` ControlGroup/capsule.
- Run `bun --filter @atmos/mobile typecheck`.
