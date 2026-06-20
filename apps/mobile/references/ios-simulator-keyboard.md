# iOS Simulator Keyboard Troubleshooting

Use this when mobile text inputs focus correctly and accept Mac keyboard input, but the iOS on-screen keyboard does not appear.

## Rule

Do not rewrite `NativeTextInput`, swap Expo UI input implementations, or add focus workarounds for this symptom until the Simulator keyboard state has been checked. If physical keyboard input works, the app input focus path is already working.

## Fix

1. Activate the iOS Simulator.
2. Open `I/O > Keyboard`.
3. Disable `Connect Hardware Keyboard`.
4. If an input is already focused and the software keyboard still is not visible, choose `Toggle Software Keyboard`.

The equivalent shortcuts are usually:

- `Cmd+Shift+K`: toggle `Connect Hardware Keyboard`
- `Cmd+K`: toggle the software keyboard

## Verification

Tap any mobile `NativeTextInput`. The iOS software keyboard should appear. If the software keyboard appears, no source code change is needed.
