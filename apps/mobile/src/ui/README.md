# Atmos Mobile UI Structure

This app uses Expo UI as the base native-control layer.

## Directories

- `src/ui/primitives`: Thin Atmos wrappers around Expo UI controls (text inputs, lists, menus, segmented controls, etc.). Import shared wrappers from `native-controls`. **Buttons are not wrapped** — feature screens import `Host` + `Button` from `@expo/ui` directly.
- `src/ui/layout`: Screen chrome, sections, rows, and data layout helpers. These can use React Native layout primitives, but they must not define replacement buttons, text inputs, pickers, switches, or lists.
- `src/features/*`: Product screens and workflows. Feature code should consume `src/ui/primitives` and `src/ui/layout` for non-button controls; use `@expo/ui` `Host` + `Button` at the call site for CTAs.
- `app/*`: Expo Router route files only. Keep implementation in `src/features` or `src/ui`.

## Design tokens and styling

- **Color source of truth**: `src/theme/colors.ts`. Light/dark values flow through `useMobileTheme()` and `src/theme/css-variables.ts`.
- **Layout tokens**: `src/theme/spacing.ts`, `src/theme/radii.ts`, `src/theme/typography.ts`, `src/theme/pressed.ts`, barrel-exported from `src/theme/tokens.ts`.
- **NativeWind path**: `@/global.css` imports generated `@theme` from `src/theme/generated-theme.css` (via `script/generate-mobile-global-theme.ts`). `MobileThemeVariablesProvider` injects runtime CSS variables from `getMobileCssVariables()` so class names track the active color scheme.
- **When to use what**:
  - **Expo UI `Host` + `Button`**: primary/secondary/destructive CTAs — customize `variant`, `style`, and Host `seedColor` at the call site (map theme tokens locally).
  - **Expo UI primitives** (`NativeTextInput`, lists, menus, segmented controls): other interactive controls and platform chrome.
  - **NativeWind `className`**: layout, spacing, surfaces, and typography on non-control containers (`AppScreen`, `Section`, `Row`, grouped cards).
  - **`useMobileTheme().colors`**: when a native API needs inline `style`/`backgroundColor`/`seedColor` (buttons, glass fallbacks, navigation `contentStyle`, terminal surfaces).
- **Page rule**: feature screens should not stack ad-hoc colors, radii, or spacing. Reach for layout helpers + tokens first; extend primitives before adding one-off styles.

### Buttons (`Host` + `Button`)

- Import official Universal API: `import { Host, Button } from "@expo/ui"`.
- Layout via documented props/modifiers: `Host matchContents={{ vertical: true }}`, Button `style.height` / `paddingHorizontal`, iOS `controlSize` + `frame`, Android `fillMaxWidth`. Do not wrap with an RN paint shell or RN `<Text>` label.
- Map theme tokens at the call site (or tiny file-local constants): filled → `ctaFill` + Host `seedColor`; outlined → `control` / `controlBorder` + `seedColor` ≈ `label`; danger → `redSurface` / `redBorder` + `seedColor` ≈ `red`.
- Do **not** introduce a shared Atmos Button wrapper component.

## Expo UI Rules

- Prefer Universal components from `@expo/ui`: `Host`, `Button`, `TextInput`, `List`, `ListItem`, `Picker`, and `Switch`.
- Every Expo UI subtree must be wrapped in `Host`. Primitive wrappers own that `Host` for non-button controls; button call sites wrap their own `Host`.
- Use platform files only when Universal does not expose the behavior we need or when the current native implementation has a platform gap.
- Do not pass React Native view nodes into Expo UI native slots such as `ListItem.trailing`; pass strings/simple native-compatible values through the primitive wrapper, or use a dedicated `RNHostView` bridge when RN content is genuinely required.
- Universal Button has no `labelColor` prop — map brand colors through Button `style` and Host `seedColor` (tint / Material seed).
- Android text input intentionally uses `@expo/ui/jetpack-compose` `OutlinedTextField`, because the current Universal TextInput path can request `BasicTextFieldView` while the dev client exposes `TextFieldView`.
- Keep Atmos branding semantic and minimal: black/white/neutral controls, no system blue defaults.
