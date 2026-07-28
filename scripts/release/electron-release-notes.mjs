/**
 * Default release-notes body for Atmos Desktop (production Electron ship path).
 * Used by release-desktop-electron.mjs when a notes file is missing.
 * Product-facing: do not mention framework names in user-visible prose.
 */

/**
 * @param {string} version calendar version e.g. 2026.7.28
 * @param {string} tag full tag e.g. desktop-electron-2026.7.28
 */
export function defaultElectronReleaseNotes(version, tag) {
  return `# Atmos Desktop ${version}

Atmos desktop release \`${version}\` (tag \`${tag}\`).

## Highlights

- Packaged desktop app with bundled Atmos Server runtime
- Shared on-disk contracts: AppShot \`~/.atmos/appshots\`, Server data \`~/.atmos/desktop\`, tunnel gateway + entry_token
- App identity: \`com.atmos.desktop\`

## Install

Download the platform artifact from this GitHub Release (DMG / NSIS / AppImage).
`;
}

/** Forbidden phrases that re-assert wrong defaults or experimental framing. */
export const FORBIDDEN_ELECTRON_NOTES_PHRASES = [
  "Experimental Chromium shell",
  "Production default remains Tauri",
  "until Phase 5 product sign-off",
  "experimental Electron",
];
