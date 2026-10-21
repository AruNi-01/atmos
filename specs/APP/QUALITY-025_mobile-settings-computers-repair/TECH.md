# TECH · QUALITY-025: Mobile Settings Computers and Re-pair

> Technical Design · HOW. Quality spec for the Atmos mobile Settings sheet. No BRAINSTORM or PRD.

## Scope summary

Settings on the phone shows a duplicated computer count, a computers list that drills into a detail route and stays open after a switch, a Re-pair sheet that paints solid near-black, and a Developer "Test page" that previews terminals without a Computer.

In scope:

1. My Computers meta is `online/total` (for example `1/2`, or `2/2` when every computer is online). The online number uses the same color token as the Online status on the computers list. The visible string does not say "online". The accessibility label still reads the counts, for example `1 of 2 online`.
2. Each computer row keeps a check on the selected computer and drops the trailing arrow. Tapping a row selects that computer and dismisses the settings sheet back to the home screen after the selection is committed.
3. Re-pair shows a visible sheet for loading, the system permission prompt, a denied state that opens Settings, and a camera failure. None of those states is a black sheet. An error boundary covers a render crash.
4. Remove the Developer Test page and every mock, route, store, and test that exists only for it.

Out of scope: parity capture (`app/preview-chat.tsx`, `EXPO_PUBLIC_PARITY_PREVIEW`), rename/revoke on `app/settings/computer.tsx` (the route stays, the list no longer links to it), new WebSocket messages, and raising the oxlint cap above 455.

## Spec id

`QUALITY-025` is the next free id.

- `origin/main` `specs/README.md` already lists QUALITY-001 through QUALITY-021 and QUALITY-024.
- Open pull requests at selection time: #343 uses QUALITY-022, #346 uses QUALITY-023. #345 is a dependency bump and does not take a QUALITY id.
- QUALITY-019 through QUALITY-024 are reserved and must not be reused.
- Search for `QUALITY-025` on open pull requests returned nothing.

## Root cause of the black Re-pair sheet

This is not a missing `NSCameraUsageDescription`, and it is not an uncaught `expo-camera` exception on the path Settings actually opens.

### What Re-pair does today

`SettingsIndexScreen` handles "Re-pair phone" with `openSignIn`: `router.dismissTo("/")` then `router.push("/sign-in")`. The push does not set `mode=scan`, so `LoginSheet` mounts with `initialScannerOpen={false}`.

The user is already paired (that is why Settings is on screen). `AuthConnectContent` therefore returns before `PairQrScanner` mounts:

```tsx
if (auth.hasDeviceCredential) {
  return (
    <AppScreen surface="sheet">
      <ActivityIndicator />
    </AppScreen>
  );
}
```

`AppScreen` returns a fragment whose only child is a `ScrollView`. Its own comment records that an outer flex column inside an iOS form sheet collapses that `ScrollView` to height 0. `app/sign-in.tsx` is that column: a `flex: 1` view whose background is `#0a0a0b` in light mode (the dock color). `app/_layout.tsx` sets the same near-black `contentStyle` on the `sign-in` form sheet. A collapsed scroll view leaves that fill as the entire sheet. There is no copy, no permission UI, and no error boundary. Nothing threw.

### What was ruled out

| Check                      | Result                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NSCameraUsageDescription` | Present in `apps/mobile/app.json` `ios.infoPlist`, and again as the `expo-camera` plugin `cameraPermission`. Android declares `android.permission.CAMERA`.                                                                                                                                                                                                                                |
| Permission hook            | `PairQrScanner` calls `useCameraPermissions()` and `requestPermission()` whenever `granted` is not true. The hook is never reached on Re-pair, because the credential short-circuit returns first.                                                                                                                                                                                        |
| Component crash            | `PairQrScanner` is not mounted. No error boundary exists, but there is also no camera exception on this path.                                                                                                                                                                                                                                                                             |
| Native camera view         | `expo-camera` iOS `CameraView.layoutSubviews` sets `backgroundColor = .black`. `CameraSessionManager.startSession` returns without `onMountError` when `AVCaptureDevice.default(for: .video)` is nil (simulator). `PairQrScanner` does not pass `onMountError`. Those defects make the **scanner well** black once the scanner is shown. They are not why today's Re-pair sheet is black. |

### Camera defects fixed in the same change

Once Re-pair opens the scanner, the current scanner still fails the acceptance bar:

- After denial, iOS sets `canAskAgain` to false. The "Allow camera" button calls `requestPermission()` again, which does not present the system dialog and does not open Settings.
- A granted-but-dead preview (no device, or `onMountError` with "Camera permissions not granted - component could not be rendered." / "Camera could not be started") stays a black `CameraView`.
- A render throw unmounts the sheet body and reveals the `#0a0a0b` content style.

## Quality target

| Item                                  | Before                                         | After                                         |
| ------------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| My Computers meta                     | `2 · 2 online` (count repeated)                | `2/2`, online count in `onlineStatusColor`    |
| Accessibility                         | The visible "online" word                      | `2 of 2 online` on the count                  |
| Computer row                          | Check plus a chevron into `/settings/computer` | Check only                                    |
| After select                          | Sheet stays on the list                        | `dismissTo("/")` after the selection commits  |
| Re-pair while paired                  | Spinner `ScrollView` on `#0a0a0b`              | Scanner sheet with a visible permission state |
| Undetermined camera                   | Not reached                                    | One `requestPermission()` call                |
| Denied, cannot ask again              | Not reached                                    | Copy plus `Linking.openSettings()`            |
| Camera mount / timeout / render throw | Black native view or black sheet               | Opaque fallback and an error boundary         |
| Developer Test page                   | Switch, `/preview`, fixtures, store            | Removed                                       |
| oxlint cap                            | `--max-warnings=455`                           | Unchanged                                     |

## Architecture overview

```
apps/mobile
  SettingsIndexScreen
    formatComputerOnlineCount + ComputerOnlineCount
    Re-pair → /sign-in?mode=scan
  SettingsComputersScreen
    ComputerList (check only)
    selectComputer → runComputerSelection → router.dismissTo("/")
  AuthConnectContent
    skip the paired short-circuit when the scanner opens
    PairScannerErrorBoundary
      PairQrScanner
        cameraScannerModel
        CameraPermissionStateView   # loading / prompt / settings / starting / error
        CameraView                   # preview only, after onCameraReady
```

No crate, table, or WebSocket message changes. Mobile copy stays in the component (this app has no `messages/` catalog).

## Module-by-module design

### `apps/mobile/src/features/settings/computer-settings.ts`

`formatComputerOnlineCount(online, total)`:

- `total <= 0` → `{ kind: "empty", label: "None", accessibilityLabel: "No computers" }`.
- Otherwise clamp `online` into `0...total` and return `{ kind: "ratio", online, total, accessibilityLabel: "${online} of ${total} online" }`.

`runComputerSelection`:

- Offline: `selectOffline()` then `dismissSheet()`.
- Online: `switchOnline(dismissSheet)`. The sheet closes only in that success callback. A failed `createClientSession` leaves the list up so the existing inline error remains.

### `apps/mobile/src/features/computers/online-status-color.ts`

```ts
export function onlineStatusColor(colors: { green: string }) {
  return colors.green;
}
```

Call sites: the Online / Offline label in `ComputerPicker` (the computers list), `ComputerStatusIndicator`, and `ComputerOnlineCount`. The online digit uses this helper. The slash and the total stay `theme.colors.secondaryLabel`.

### `apps/mobile/src/features/settings/SettingsIndexScreen.tsx`

My Computers passes `ComputerOnlineCount` as the row meta. Re-pair pushes `{ pathname: "/sign-in", params: { mode: "scan" } }` after `dismissTo("/")`. Delete the Developer section and the `PreviewModeSwitch` import.

### `apps/mobile/src/features/computers/ComputerPicker.tsx`

Delete `onManage` and `ChevronRightIcon`. The selected row renders `CheckIcon` only. `SettingsComputersScreen` stops pushing `/settings/computer`.

### `apps/mobile/src/features/settings/use-mobile-settings-controller.ts`

`selectComputer` calls `runComputerSelection`. `dismissSheet` is `router.dismissTo("/")`. `switchOnline` is `switchComputer.mutate(serverId, { onSuccess })`.

### Re-pair and the scanner

`app/sign-in.tsx` wraps `LoginSheet` in an error boundary whose fallback is a `flex: 1` view on `theme.colors.sheetBackground` with a title and a sentence. A crash no longer leaves `#0a0a0b` as the only pixels.

`AuthConnectContent`:

- `hasDeviceCredential && !initialScannerOpen` still avoids the pair form, but the replacement is a `flex: 1` view on `sheetBackground` with "This phone is already paired." It does not use `AppScreen`'s fragment `ScrollView`.
- `initialScannerOpen` (Re-pair's `mode=scan`) skips that return and mounts the scanner even when a credential exists.

`cameraScannerModel` in `camera-permission-state.ts`:

| Input                                   | View                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `mountError` set                        | `error`                                                                                              |
| `permission == null`                    | `loading`                                                                                            |
| `granted` false and `canAskAgain` false | `settings`                                                                                           |
| `granted` false and `canAskAgain` true  | `prompt`; `autoRequest` only when `status` is `undetermined` (missing status counts as undetermined) |
| granted, not ready, timed out           | `error`                                                                                              |
| granted, not ready                      | `starting` (camera mounted underneath an opaque cover)                                               |
| granted and `onCameraReady`             | `preview`                                                                                            |

`PairQrScanner` calls `requestPermission()` once when the model says `autoRequest`. The settings action is `Linking.openSettings()` from `react-native`. `onMountError` stores `message`. If `onCameraReady` has not fired `CAMERA_PREVIEW_TIMEOUT_MS` (2500) after permission is granted, the model becomes `error`. That covers the simulator path where `startSession` returns without an event because no video device exists.

`CameraPermissionStateView` paints `theme.colors.sheetBackground` (opaque `#f8f8f9` / `#1c1c1e`). It does not use `#000000`, `#0a0a0b`, or `cardSubtle`. Loading, prompt, settings, starting, and error all use it. Only `preview` shows `CameraView` without that cover.

`PairScannerErrorBoundary` wraps `PairQrScanner` and renders the same error view.

### Test page removal

Delete only the mock-terminal path:

- `apps/mobile/app/preview.tsx`
- `apps/mobile/src/features/preview/PreviewModeSwitch.tsx`
- `apps/mobile/src/features/preview/PreviewTerminalScreen.tsx`
- `apps/mobile/src/features/preview/preview-fixtures.ts`
- `apps/mobile/src/features/preview/preview-fixtures.test.ts`
- `apps/mobile/src/stores/preview-store.ts`
- The `preview` `Stack.Screen` in `app/_layout.tsx`
- The Developer section in Settings

Keep `app/preview-chat.tsx` and the parity preview modules. `expo-ui-web-stub.tsx` stays; its comment stops naming the Test page. `apps/mobile/AGENTS.md` drops `preview.tsx` from the route tree.

There is no mobile `messages/` catalog. The strings "Test page" and "Preview terminals without a Computer" live only in the deleted components.

## Data model

No new wire types. `ComputerRow.online` is unchanged.

## Transport

No new WebSocket message and no new REST route. Computer switch still uses the existing Relay `createClientSession` call inside `switchComputer`.

## Rollout

One mobile change. No flag. Ship the spec, then the app code, in that order.

## Risks

- `router.dismissTo("/")` from the computers screen must dismiss the settings form sheet, not only the computers stack frame. The same call already leaves Settings from Re-pair.
- Closing the sheet only after `createClientSession` succeeds means a slow network keeps the list up until the session exists. A failure stays on the list with the existing error. That is the committed selection.
- The 2500 ms preview timeout can flash "camera unavailable" on a slow device, then a retry mounts the camera again. The cover is visible the whole time, so the wait is not a black sheet.
- `CameraView.isAvailableAsync` is web-only and throws `UnavailabilityError` on iOS. Do not call it. The timeout plus `onMountError` is the native signal.
- Removing `/preview` does not remove `/preview-chat`. A later change must not delete the parity route while cleaning "preview".

## Verification

- `bun --filter @atmos/mobile test` for the new tests and the mobile suite.
- `bun --filter @atmos/mobile typecheck`.
- `bunx oxlint --fix` and `bunx oxfmt` on the touched paths. Root `package.json` `lint` stays `oxlint --max-warnings=455`.
- iOS simulator screenshots (light and dark) are manual. Bundle id is `land.atmos.mobile` from `app.json`. Steps are in TEST.md.

## Follow-ups

- Rename and revoke remain on `/settings/computer` with no in-app link from the list.
- The sign-in route's `contentStyle` stays `#0a0a0b` in light mode so the dock's rounded corners match the dock. The body and every fallback paint `sheetBackground` over it.
