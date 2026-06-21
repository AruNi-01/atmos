# Mobile Design

Mobile has its own design system branch. It should feel like Atmos, but it should behave and render like a native iOS or Android app.

## Product Shape

The mobile app is a lightweight native client for remote Atmos Computer workflows. It should focus on:

- connecting to a remote computer;
- browsing workspaces;
- opening one workspace at a time;
- using one terminal surface at a time;
- reviewing the essential Changes and Commit surface;
- managing mobile-specific settings.

Do not port the Web/Desktop shell to mobile. Mobile should not include Center Stage, Right Sidebar, terminal mosaic panes, desktop Canvas pinning, or Web editor chrome.

## Native Controls First

Mobile app chrome and basic controls should use native UI wherever practical:

- buttons;
- menus;
- lists;
- list items;
- forms;
- text inputs;
- pickers;
- switches;
- segmented controls;
- sheets;
- dialogs;
- settings rows;
- navigation headers and header menus.

Implementation should use the mobile native-control layer under `apps/mobile/src/ui/primitives`, primarily Expo UI wrappers. Feature screens should consume these wrappers rather than importing Web UI components or importing Expo UI directly.

Never import `@workspace/ui` shadcn components into mobile.

## iOS

iOS should follow Apple's current native design language, including Liquid Glass where the system and Expo/native APIs provide it.

Rules:

- Use native stack navigation titles instead of body-level fake page titles.
- Use large native titles for dashboard, setup, settings, picker, and form-sheet pages.
- Use compact native titles for workspace, terminal, and other detail surfaces.
- Use native header items and native menus for route-level actions.
- Use SF Symbols for iOS header and menu icons when possible.
- Use system Liquid Glass surfaces for navigation, grouped header controls, tab bars, sheets, and floating chrome where the platform owns the material.
- Prefer system-provided Liquid Glass or `expo-glass-effect` `GlassView` over custom translucent React Native views.
- Provide fallback solid or tinted surfaces when Liquid Glass APIs are unavailable.
- Respect accessibility settings such as reduced transparency and increased contrast by relying on native controls and system materials.

Do not hand-roll glass capsules inside page content to mimic iOS header buttons. Do not put custom SwiftUI `ControlGroup`, `GlassView`, or hand-built translucent wrappers inside React Navigation `headerRight` when native stack header items can own the control.

## Android

Android should feel native to Android, not like an iOS Liquid Glass clone.

Rules:

- Use Expo UI universal controls or Jetpack Compose wrappers where available.
- Use Android-appropriate menus, lists, switches, text fields, and sheets.
- Use app asset icons for Android header and menu icons when SF Symbols are not available.
- Keep Atmos' neutral black/white identity, but let Android controls preserve native density, ripple/pressed feedback, and platform accessibility behavior.
- Do not copy iOS glass effects onto Android unless Android provides an equivalent native material in the selected Expo UI path.

## Mobile Visual Language

Mobile should be calmer and more linear than Web/Desktop:

- use stacked screens instead of multi-pane layouts;
- use native navigation bars instead of custom header rows;
- use sections and grouped lists instead of dense sidebars;
- keep cards shallow and purposeful;
- keep terminal controls outside the terminal renderer;
- use larger touch targets than Web/Desktop;
- avoid hover-only interactions;
- avoid tiny metadata clusters that require desktop pointer precision.

Mobile may use the mobile theme tokens in `apps/mobile/src/theme/colors.ts`, including `glassFallback`, `glassTint`, `glassBorder`, platform terminal colors, and mobile-specific card colors. These tokens do not need to match Web/Desktop values exactly; they should preserve Atmos' neutral, operational tone while supporting native platform materials.

## Component Rules

- Buttons should use the native `NativeButton` wrapper and platform-specific variants.
- Menus should use `NativeMenuButton` and native menu actions.
- Segmented controls should use native segmented-control wrappers.
- Text input should use native Expo UI text input wrappers; Android may use Jetpack Compose `OutlinedTextField`.
- List and settings rows should be native list-style rows or mobile layout helpers, not Web cards.
- Sheets should use native route presentation where possible, especially iOS `formSheet`.
- Header buttons should be native navigation/header items, not custom body-positioned glass buttons.
- Business/content icons may use `lucide-react-native` through `src/ui/icons/lucide-native.ts`.

