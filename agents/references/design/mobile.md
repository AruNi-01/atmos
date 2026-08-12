# Mobile Design

Mobile has its own design system branch. It should feel like a native, ChatGPT-style iOS/Android companion for Atmos: quiet white/black surfaces, generous rounded controls, bottom-anchored primary actions, and linear task flows.

## Reference Priority

When a mobile decision conflicts with general Atmos Web/Desktop design guidance, this file wins for `apps/mobile`.

Use the ChatGPT iOS app as the mobile visual reference:

- mostly white or near-white screens in light mode;
- black primary actions;
- large pill-shaped text inputs and primary buttons;
- bottom prompt/action docks as the primary action anchor;
- sparse hero/empty states with centered copy;
- light grouped surfaces for lists and settings;
- native navigation headers and native menus instead of custom app chrome.

Do not force Web/Desktop density, modest radius, border-heavy hierarchy, or dashboard-card composition onto mobile.

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

## Mobile Tokens

The implementation source of truth is `apps/mobile/src/theme/colors.ts`.

Current token direction:

- light page background: `#f4f4f6`;
- light sheet background: `#f8f8f9`;
- light grouped surfaces: `#ffffff`;
- light subtle fills: `rgba(10, 10, 11, 0.05)`;
- dark page background: `#000000`;
- dark sheet background: `#1c1c1e`;
- dark grouped surfaces: `#2c2c2e`;
- dark subtle fills: `rgba(255, 255, 255, 0.08)`;
- dark text input fills: `#2c2c2e`, matching the ChatGPT dark form fields;
- dark raised control fills: `#3a3a3c`;
- dark disabled controls: `#343436` with disabled text color, not whole-control opacity;
- dark control border: `rgba(255, 255, 255, 0.035)` so text fields read as filled pills, not outlined boxes;
- dark control glass tint: `rgba(58, 58, 60, 0.38)`;
- dark glass fallback: `rgba(44, 44, 46, 0.94)` and `rgba(58, 58, 60, 0.92)`;
- dark glass tint: `rgba(58, 58, 60, 0.28)`;
- dark glass border: `rgba(255, 255, 255, 0.08)`;
- input cursor and text selection accent: iOS blue `#0a84ff`;
- foreground: black/near-black in light mode and `#f5f5f7` in dark mode;
- secondary text: mid gray (`#52525b` light, `#8e8e93` dark), used generously to keep hierarchy quiet;
- card/surface radius: about 24px;
- controls: about 28px radius, often visually pill-shaped;
- text inputs: at least 56px tall;
- primary buttons: at least 52px tall, black fill, white label;
- prompt docks: pill-shaped, bottom anchored, with a black circular send/action affordance.
- terminal background: always match Web terminal dark surface `#09090b`; terminal does not use the ChatGPT-style card/input gray ladder.

Mobile token choices do not need to match Web/Desktop values. They should match the ChatGPT-style native phone experience while preserving Atmos' black/white operational tone.

Dark mode should use the iOS-style deep gray surface ladder from the reference app: black page backdrop, dark gray sheets, and visibly lighter grouped cards. Cards should be plain `View`/`Pressable` surfaces using `card*` colors, not Liquid Glass wrappers.

Text inputs, segmented controls, and pill action buttons should use the `control*` token family instead of reusing ad hoc colors. Text inputs are plain filled rounded fields, not `GlassPanel` wrappers. Disabled buttons should use disabled control colors; do not make the entire wrapper translucent with opacity.

Form-sheet routes should use `theme.colors.sheetBackground` for route `contentStyle` and `AppScreen surface="sheet"`. Dark sheets need a slight lift from the pure-black page background so the sheet edge and dimmed backdrop remain visible.

## iOS

iOS should follow Apple's current native design language with ChatGPT-like restraint. Use Liquid Glass where the system and Expo/native APIs provide it, especially for navigation and floating chrome.

Rules:

- Use native stack navigation titles instead of body-level fake page titles.
- Use large native titles for dashboard, setup, settings, picker, and form-sheet pages.
- Use compact native titles for workspace, terminal, and other detail surfaces.
- Use native header items and native menus for route-level actions.
- Use SF Symbols for iOS header and menu icons when possible.
- Use system Liquid Glass surfaces for navigation, grouped header controls, tab bars, sheets, floating chrome, buttons, segmented controls, and switches where the platform or `expo-glass-effect` can own the material.
- Prefer system-provided Liquid Glass or `expo-glass-effect` `GlassView` over custom translucent React Native views.
- Treat mobile as glass-first for controls on iOS, but keep grouped content cards plain and visibly separated from the page background.
- For grouped content, settings sections, dashboard cards, info panels, and list containers, use a plain `View` or `Pressable` with `backgroundColor: theme.colors.cardElevated`, `borderColor: theme.colors.glassBorder`, and the standard large card radius. Do not wrap these cards in `GlassPanel`.
- Controls that should feel glass, including segmented controls and secondary action buttons, should still use `GlassPanel`; make the material subtle instead of replacing it with a plain `View`.
- Text input frames must be plain rounded filled fields using `theme.colors.control` and `theme.colors.controlBorder`; do not wrap text inputs in `GlassPanel`.
- Pill action buttons should use `theme.colors.control`, `controlElevated`, `controlDisabled`, `controlBorder`, and `controlGlassTint` so they read as controls inside dark cards.
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

Mobile should be calmer and more linear than Web/Desktop, with the ChatGPT iOS app as the primary visual reference:

- use stacked screens instead of multi-pane layouts;
- use native navigation bars instead of custom header rows;
- use white or near-white screens with sparse typography and very light gray grouped surfaces;
- use large rounded text inputs, primary buttons, and bottom action bars;
- use bottom-anchored primary actions for creation, connection, and prompt-like entry points;
- use sections and grouped lists instead of dense sidebars or dashboard cards;
- keep cards shallow, large-radius, and purposeful; in dark mode they should be deep gray surfaces visibly lifted from the black background, not border-only black panels or heavy medium-gray slabs;
- use icon-only header actions and compact text labels where the platform already gives context;
- prefer a single primary action per screen, usually in the bottom dock/footer;
- make secondary actions text-like or menu-based instead of filled buttons in every row;
- keep terminal controls outside the terminal renderer;
- use larger touch targets than Web/Desktop;
- avoid hover-only interactions;
- avoid tiny metadata clusters that require desktop pointer precision.

Avoid these older mobile patterns:

- KPI-style dashboard cards for navigation;
- multiple filled buttons inside list rows;
- uppercase metadata labels everywhere;
- dense desktop-style status clusters;
- custom translucent views that imitate glass instead of using `expo-glass-effect`;
- boxed page sections that make every screen feel like a settings form.

## Component Rules

- Buttons should use `ExpoUiButton` from `native-controls` for product CTAs and settings actions.
- Filled `ExpoUiButton` is the primary black/white pill action. Use it sparingly.
- `variant="outlined"` is preferred for secondary actions; `tone="danger"` for destructive actions.
- Menus should use `NativeMenuButton` and native menu actions.
- On iOS, inline menu buttons should be SwiftUI `Menu` triggers with string/SF Symbol labels through `NativeMenuButton`; do not use `MenuView` with an `RNHostView`/React Native child as the trigger for row controls.
- Segmented controls should use mobile wrappers. On iOS, use the native Expo UI segmented control directly so the system owns the sliding selection animation, press-drag selection behavior, and Liquid Glass/native material. Do not add a second visible `GlassPanel` track around it, and do not replace it with custom `Pressable` segments for settings theme controls.
- Text input should use native Expo UI text input wrappers; Android may use Jetpack Compose `OutlinedTextField`.
- Text input frames should be large plain filled rounded fields, not glass panels, compact desktop inputs, or high-contrast outlined boxes.
- List and settings rows should be native list-style rows or mobile layout helpers, not Web cards.
- Grouped list sections should use plain large-radius surfaces with a visible white or deep-gray fill. Do not use `GlassPanel` for cards, grouped settings sections, dashboard cards, info panels, or list containers.
- Workspace list rows show workflow status as the same Linear-style circular icon family used on Web, placed at the trailing edge of the branch/subtitle line. Tapping the icon opens a native menu to change status; menu actions must also show the corresponding status icon. Do not render workflow status as row text, and do not position the status trigger as an overlay on top of the row press target.
- Home and creation flows should use prompt-like bottom action docks when a single next action dominates.
- Sheets should use native route presentation where possible, especially iOS `formSheet`.
- Header buttons must be icon-only. On iOS use native-stack `unstable_headerRightItems` / `unstable_headerLeftItems` with SF Symbols. Do not put `ExpoUiButton`, text buttons such as `Refresh`, `New`, or `Import`, custom `GlassPanel`, or hand-built capsules in `headerRight`.
- Android header fallbacks should also be icon buttons unless a native menu requires a text title inside the menu.
- Business/content icons may use `lucide-react-native` through `src/ui/icons/lucide-native.ts`.
