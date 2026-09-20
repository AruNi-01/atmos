# TECH · APP-077: Mobile Terminal Main Path

> Technical Design · HOW the mobile app keeps homepage + auth and rebuilds a terminal-only path.

## Architecture

Mobile-only. No new `WsAction`. Reuse `project_workspace_bootstrap`, `terminal_workspace_candidates`, workspace create, and the native terminal WebSocket.

```text
Home (index, kept)
  ├─ AuthConnectContent (scan / OAuth) when disconnected
  ├─ Computer Connect sheet
  ├─ Workspaces sheet → Create Workspace sheet
  └─ Workspace stack → TerminalScreen
        ├─ Terminal chrome: workspace popover + flattened tabs + plus + group
        ├─ Expo BottomSheet drawer (group list)
        ├─ one TerminalWebView
        └─ TerminalShortcutBar (shortcut popovers)
```

## Overlay rule

| Surface | Component |
|---------|-----------|
| Drawer / sheet (group list, Computer Connect, Workspaces, Create Workspace, Sign-in) | Expo Router `formSheet` or `@expo/ui` `BottomSheet` |
| Popover (account, workspace switcher, Ctrl/Move/Agent) | `expo-ios-popover` on iOS; RN modal overlay on Android — **not** a BottomSheet |

Do not use `PopoverTransition.Matched` for the group list; that presents a sheet and would mix drawer/popover.

## Flattened terminals

`terminal_workspace_candidates` already returns active sessions plus tmux windows for the workspace. Mobile must:

1. Treat each candidate `id` as its own tab (do not merge distinct ids because `tmux_window_index` / name match).
2. Sort siblings by `tmux_window_index` (missing last), then `label`, then `id`.
3. Render that ordered list in the top tab strip **and** the group drawer.

New local terminals (`isNew`) append after server candidates and stay selectable.

## Routes

**Keep / restyle**

- `app/index.tsx` — homepage unchanged in product copy/layout; gear opens account popover.
- `app/sign-in.tsx` — scan / OAuth sheet.
- `app/computer-connect.tsx`
- `app/workspaces.tsx`
- `app/create-workspace.tsx`
- `app/workspace/[workspaceId].tsx` — terminal only.

**Delete**

- `app/onboarding.tsx` (homepage already embeds auth).
- `app/import-project.tsx`
- `app/settings/**`
- Workspace Changes / Overview tabs and `src/features/git/**` screens.

Sign-out: `signOutThisPhone` from a homepage popover (same Hub revoke behavior as settings).

## New modules (`apps/mobile`)

- `src/ui/primitives/ios-popover.{ios,android,tsx}` — compound Trigger/Content/Pressable.
- `src/ui/primitives/expo-drawer.tsx` — `@expo/ui` `BottomSheet` wrapper.
- `src/features/terminal/TerminalTabsBar.tsx` — horizontal tabs + plus + group.
- `src/features/onboarding/use-sign-out-phone.ts` — extracted from settings controller.

## Visual language

- System-like grouped lists, continuous corners, sentence-case English labels (no `uppercase` chips).
- Terminal surface stays Web-dark (`terminalSurfaceColors`).
- Tab switches do not slide (`animation: none` between peer terminals).
- Popover present spring: critically damped (`bounce: 0`, ~350ms) per apple-design / animate-expo.

## Risks

- Android must resolve `ios-popover.android.tsx` so Metro never loads `expo-ios-popover`.
- Nested `Host` inside `BottomSheet` can fail; drawer rows use RN `Pressable`.
- Native-stack `unstable_headerRightItems` cannot host `Popover.Trigger`; account and workspace switchers live as React triggers (home `headerRight`, terminal chrome).

## Rollout

1. Overlay primitives + flatten/sort helper + tests.
2. Terminal chrome + drawer + shortcut popovers.
3. Delete extra routes; homepage account popover; workspace picker minus import.
4. `bun --filter @atmos/mobile typecheck` and `bun --filter @atmos/mobile test`.
