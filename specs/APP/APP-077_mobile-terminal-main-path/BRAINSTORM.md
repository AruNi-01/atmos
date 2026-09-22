# BRAINSTORM · APP-077: Mobile Terminal Main Path

> Brainstorm · settle the mobile dogfood path around login, Computers, workspaces, and one flattened terminal surface.

## Problem

The current mobile app has too many secondary screens (settings stack, import project, Changes, Overview) whose UI is not ready. The homepage and scan/login already work. Dogfood needs one terminal main path with Apple-like chrome.

## Direction (settled)

- Keep the current homepage.
- Keep Hub OAuth + QR pair.
- After connect: Computers list → connect → workspace/project list → workspace terminal.
- Create workspace and create terminal stay in-path.
- Flatten every terminal in a workspace (web tabs and windows under those tabs) into one top tab strip, sorted as siblings.
- Tabs trailing control: group button opens an Expo drawer (`@expo/ui` `BottomSheet`) with the same list.
- Popovers use `expo-ios-popover` (Android: modal overlay fallback). Drawers stay Expo.
- Visual language: Apple HIG / WWDC fluid-interface restraint (Emil Kowalski `apple-design` + Expo native UI skills).

## Rejected

- Porting Web mosaic / Center Stage / Changes & Commit into this cut.
- Using `expo-ios-popover` matched-sheet for the group list (that is a drawer; Expo `BottomSheet` / form sheets own drawers).
- Deleting scan/login or the homepage hero.

## Ready to promote

- Must-have main path only: auth, Computers, workspaces, create workspace, flattened terminal tabs, keyboard shortcut bar.
- Delete extra routes: settings stack, import-project, onboarding duplicate, Changes/Overview tabs.
