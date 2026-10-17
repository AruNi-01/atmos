# Pairing / sign-in

## Sub-features

- Pair screen with slogan "Pair this phone with your Computer." and the 3 scan steps
- "Scan QR" opens the camera scanner (PairQrScanner); "Hide scanner" closes it
- "Continue with GitHub" / "Continue with Google" OAuth
- Re-pair from Settings ("Re-pair phone")

## How to get to it (user POV)

Fresh install, or Settings → Re-pair phone. Route `/sign-in` (`?mode=scan` opens the scanner).

## Driving it with e2e

`tests/smoke.e2e.ts`: `getByText('Pair this phone with your Computer.')`, `getByText('Scan QR')`, `getByText('Continue with GitHub')`. The QR claim and OAuth are not scriptable deterministically; pair by hand once.

## Proof

Unpaired: the three landmarks are visible. Paired: the workspace list renders and the Computer shows the phone as a device on Desktop.

## Charters

`pairing-scanner|ios|explorer|Open and close the QR scanner repeatedly and with camera permission denied, and check the pair screen stays usable.`

## Gotchas

Simulator has no camera: the scanner shows a permission/blank view, that is not a bug. OAuth opens a browser sheet outside the app.
