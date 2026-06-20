# Atmos Mobile UI Structure

This app uses Expo UI as the base native-control layer.

## Directories

- `src/ui/primitives`: Thin Atmos wrappers around Expo UI controls. This is the default place to import from `@expo/ui`, `@expo/ui/swift-ui`, or `@expo/ui/jetpack-compose`.
- `src/ui/layout`: Screen chrome, sections, rows, and data layout helpers. These can use React Native layout primitives, but they must not define replacement buttons, text inputs, pickers, switches, or lists.
- `src/features/*`: Product screens and workflows. Feature code should consume `src/ui/primitives` and `src/ui/layout` instead of importing Expo UI directly.
- `app/*`: Expo Router route files only. Keep implementation in `src/features` or `src/ui`.

## Expo UI Rules

- Prefer Universal components from `@expo/ui`: `Host`, `Button`, `TextInput`, `List`, `ListItem`, `Picker`, and `Switch`.
- Every Expo UI subtree must be wrapped in `Host`. Primitive wrappers own that `Host` so feature screens do not repeat it.
- Use platform files only when Universal does not expose the behavior we need or when the current native implementation has a platform gap.
- Do not pass React Native view nodes into Expo UI native slots such as `ListItem.trailing`; pass strings/simple native-compatible values through the primitive wrapper, or use a dedicated `RNHostView` bridge when RN content is genuinely required.
- Button has platform files because the Universal button API does not expose enough cross-platform color control for Atmos' black/white brand treatment.
- Android text input intentionally uses `@expo/ui/jetpack-compose` `OutlinedTextField`, because the current Universal TextInput path can request `BasicTextFieldView` while the dev client exposes `TextFieldView`.
- Keep Atmos branding semantic and minimal: black/white/neutral controls, no system blue defaults.
