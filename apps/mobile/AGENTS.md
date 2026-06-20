# Mobile Application - AGENTS.md

> **📱 Expo Native Client**: Real iOS/Android mobile app for remote Atmos Computer workflows. This is not a PWA or embedded `app.atmos.land` shell.

---

## Build And Test

- **Dev server**: `just dev-mobile` or `cd apps/mobile && bun run start`
- **iOS dev build**: `cd apps/mobile && bun run ios`
- **Android dev build**: `cd apps/mobile && bun run android`
- **Typecheck**: `bun --filter @atmos/mobile typecheck`
- **Doctor**: `apps/mobile/script/build_and_run.sh --doctor`
- **Fresh machine setup**: [agents/references/mobile-dev-setup.md](../../agents/references/mobile-dev-setup.md)

Use `expo run:ios` / `expo run:android` for acceptance smoke because the app uses native modules and `expo-dev-client`. Expo Go is useful for quick checks only when native module coverage is not under test.

---

## 📁 Directory Structure

```
apps/mobile/
├── app/                     # Expo Router routes
│   ├── _layout.tsx
│   ├── index.tsx            # Workspace list home
│   ├── onboarding.tsx
│   ├── settings.tsx
│   ├── create-workspace.tsx
│   ├── import-project.tsx
│   └── workspace/[workspaceId].tsx
├── src/
│   ├── api/                 # Mobile-owned Relay/control-plane/WS clients
│   ├── features/            # Product screens: onboarding, workspaces, terminal, git
│   ├── hooks/
│   ├── lib/
│   ├── providers/
│   ├── stores/
│   ├── theme/
│   └── ui/                  # Expo UI wrappers and small layout helpers
├── script/build_and_run.sh
├── app.json
└── package.json
```

Generated native folders `ios/` and `android/` are managed by Expo prebuild and ignored by `apps/mobile/.gitignore`. Do not hand-edit generated native files unless a native config change is explicitly required and documented.

---

## Product Shape

- Mobile is a lightweight client for a remote Atmos Computer. It never starts or requires a local Atmos Server on the phone.
- Access Token and Relay control-plane bootstrap follow APP-016.
- Primary post-auth screen is the workspace list.
- Workspace development is terminal-first and shows exactly one terminal renderer at a time.
- The only Web right-sidebar-derived M1 surface is Changes & Commit.

Spec: [specs/APP/APP-025_mobile-app](../../specs/APP/APP-025_mobile-app/)

---

## UI Conventions

- Use Expo UI native controls where practical for app chrome, buttons, lists, forms, menus, sheets, dialogs, and settings.
- Use `lucide-react-native` for mobile business/content icons that should match web Lucide icons. Import icons through the narrow wrapper in `src/ui/icons/lucide-native.ts`; do not import from the `lucide-react-native` package root in feature files, because its full type surface can make mobile typecheck unstable.
- Use `src/features/terminal/MobileAgentIcon.tsx` for built-in/custom terminal agent icons. Do not reuse web `AgentIcon`; it depends on Next/Image and DOM behavior.
- Import shared mobile controls from `src/ui/primitives/native-controls`; add new Expo UI wrappers under `src/ui/primitives`.
- Keep route-level layout helpers under `src/ui/layout`.
- Page titles, headers, navigation bars, and header buttons must follow [agents/references/mobile-native-navigation.md](../../agents/references/mobile-native-navigation.md). Do not hand-roll page titles or native-looking header chrome.
- iOS grouped header menus must use native-stack header items (`unstable_headerRightItems` / `unstable_headerLeftItems`) as documented in [agents/references/mobile-native-navigation.md](../../agents/references/mobile-native-navigation.md); do not put Expo UI SwiftUI `ControlGroup` or custom glass capsules in `headerRight`.
- Stack routes must set titles through `Stack.Screen` options, using `src/ui/navigation/native-screen-options.ts` helpers. Do not render page titles as normal `<Text>` inside the screen body.
- Large-title pages must let the native stack own the header: the route's first rendered screen content must be an `AppScreen`/`ScrollView` with `contentInsetAdjustmentBehavior="automatic"`, and large-title routes must not force `headerTransparent: false` or a custom `headerStyle.backgroundColor`.
- Compact workspace/detail screens should use compact native-stack titles and native header actions/menus; do not create custom back buttons, fake centered titles, or extra header bars in the page body.
- Use NativeWind for layout, spacing, and surfaces that Expo UI does not own.
- Do not import `@workspace/ui` shadcn components into mobile.
- Keep screens simple and phone-focused. Do not port desktop Center Stage, RightSidebar shell, terminal mosaic panes, Canvas pinning, or Web editor chrome into mobile.
- Prefer feature-local components under `src/features/<feature>/` over app-wide shared buckets.

---

## API & Transport

- App bootstrap/session issuance uses the existing Relay control plane REST routes.
- Business workflows use the main app WebSocket through `src/api/mobile-ws-client.ts` and `src/api/ws-actions.ts`.
- Terminal transport uses the native-owned terminal WebSocket through `src/api/terminal-ws-client.ts`.
- The terminal WebView must not receive Access Token, `client_token`, Relay URLs, or `terminal_ws_url`.
- Do not add mobile-only REST shortcuts for project, workspace, terminal, or Git flows. Extend shared WS actions instead.

---

## Safety Rails

### NEVER

- Replace the native app with a PWA or hosted web shell.
- Queue terminal input, Git commits, or pushes while disconnected.
- Render multiple terminal panes side by side on phone.
- Expose commit history, PR panels, notes/TODO/review panels, AI commit generation, discard, or chunk-level patch controls in the M1 mobile Git surface.
- Log Access Tokens, `client_token`, register tokens, or Relay/server secrets.

### ALWAYS

- Run `bun --filter @atmos/mobile typecheck` after mobile code changes.
- For environment/setup work, follow [agents/references/mobile-dev-setup.md](../../agents/references/mobile-dev-setup.md).
- For navigation/header/title work, follow [agents/references/mobile-native-navigation.md](../../agents/references/mobile-native-navigation.md).
- Smoke iOS and Android dev builds before claiming platform readiness.
- Keep Control Plane URL overrides and token switching in settings, outside the primary workspace list flow.

---

## Related

- [apps/api/AGENTS.md](../api/AGENTS.md)
- [packages/relay/AGENTS.md](../../packages/relay/AGENTS.md)
- [apps/web/AGENTS.md](../web/AGENTS.md)
