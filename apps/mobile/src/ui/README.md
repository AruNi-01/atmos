# Atmos Mobile UI Structure

This app uses Expo UI as the base native-control layer.

## Directories

- `src/ui/primitives`: Thin Atmos wrappers around Expo UI controls. This is the default place to import from `@expo/ui`, `@expo/ui/swift-ui`, or `@expo/ui/jetpack-compose`.
- `src/ui/layout`: Screen chrome, sections, rows, and data layout helpers. These can use React Native layout primitives, but they must not define replacement buttons, text inputs, pickers, switches, or lists.
- `src/features/*`: Product screens and workflows. Feature code should consume `src/ui/primitives` and `src/ui/layout` instead of importing Expo UI directly.
- `app/*`: Expo Router route files only. Keep implementation in `src/features` or `src/ui`.

## Design tokens and styling

- **Color source of truth**: `src/theme/colors.ts`. Light/dark values flow through `useMobileTheme()` and `src/theme/css-variables.ts`.
- **Layout tokens**: `src/theme/spacing.ts`, `src/theme/radii.ts`, `src/theme/typography.ts`, `src/theme/pressed.ts`, barrel-exported from `src/theme/tokens.ts`.
- **NativeWind path**: `@/global.css` imports generated `@theme` from `src/theme/generated-theme.css` (via `script/generate-mobile-global-theme.ts`). `MobileThemeVariablesProvider` injects runtime CSS variables from `getMobileCssVariables()` so class names track the active color scheme.
- **When to use what**:
  - **Expo UI primitives** (`ExpoUiButton`, `NativeTextInput`, lists, menus, segmented controls): interactive controls and platform chrome.
  - **NativeWind `className`**: layout, spacing, surfaces, and typography on non-control containers (`AppScreen`, `Section`, `Row`, grouped cards).
  - **`useMobileTheme().colors`**: only when a primitive or native API still needs inline `style`/`backgroundColor` (glass fallbacks, navigation `contentStyle`, terminal surfaces).
- **Page rule**: feature screens should not stack ad-hoc colors, radii, or spacing. Reach for layout helpers + tokens first; extend primitives before adding one-off styles.

### ExpoUiButton

- Thin Universal wrapper: `<Host matchContents={{ vertical: true }} seedColor={…}><Button label variant style /></Host>`.
- Colors/radius via Button `style` + Host `seedColor` (no outer RN paint shell, no RN `<Text>` label).
- Default filled black/white primary pill for creation, onboarding, Connect, and bottom actions.
- `variant="outlined"` for secondary actions; `tone="danger"` for destructive actions.

## Expo UI Rules

- Prefer Universal components from `@expo/ui`: `Host`, `Button`, `TextInput`, `List`, `ListItem`, `Picker`, and `Switch`.
- Every Expo UI subtree must be wrapped in `Host`. Primitive wrappers own that `Host` so feature screens do not repeat it.
- Use platform files only when Universal does not expose the behavior we need or when the current native implementation has a platform gap.
- Do not pass React Native view nodes into Expo UI native slots such as `ListItem.trailing`; pass strings/simple native-compatible values through the primitive wrapper, or use a dedicated `RNHostView` bridge when RN content is genuinely required.
- Universal Button has no `labelColor` prop — Atmos maps brand colors through Button `style` and Host `seedColor` (tint / Material seed).
- Android text input intentionally uses `@expo/ui/jetpack-compose` `OutlinedTextField`, because the current Universal TextInput path can request `BasicTextFieldView` while the dev client exposes `TextFieldView`.
- Keep Atmos branding semantic and minimal: black/white/neutral controls, no system blue defaults.
