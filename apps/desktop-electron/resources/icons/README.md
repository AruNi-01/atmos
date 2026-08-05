# Atmos icons (Electron shell)

## Layout

| Asset | Role |
|-------|------|
| `icon.icon/` | **macOS 26+ Liquid Glass** Icon Composer package (source). electron-builder + `actool` ≥ 26 → `Assets.car` + legacy ICNS. |
| `icon.icns` | Legacy macOS app / DMG volume icon (also emitted from `.icon` when actool runs). |
| `icon.png` / `icon.ico` | Window chrome, Windows installer, dev `dock.setIcon` (PNG preferred). |
| `32x32.png`, `128x128*.png` | Fallback sizes |

Legacy bitmap/icns/ico are **synced** from the Tauri pack:

`apps/desktop/src-tauri/icons/`

```bash
bun run sync-icons
# also runs as part of bun run build / package
```

## macOS 26 Dock (Liquid Glass)

Tahoe shrinks plain `.icns` into a tiny glyph on the Dock. Packaging must embed:

1. `Contents/Resources/Assets.car` + `CFBundleIconName` (from `icon.icon` via `actool`)
2. `Contents/Resources/icon.icns` + `CFBundleIconFile` (older macOS + DMG)

**How packaging works**

- `electron-builder.yml` → `mac.icon: icon.icns` (legacy app + **DMG volume** icon)
- `dmg.icon: icon.icns` — Finder disk-image icon **cannot** use Liquid Glass `Assets.car`
- `afterPack: scripts/after-pack-macos-icon.cjs` runs `actool` on `icon.icon/` and injects `Assets.car` + `CFBundleIconName=Icon` into the `.app`
- Tahoe Dock/Finder for the **running/installed app** → `Assets.car`; **DMG volume** and older macOS → `icon.icns`

When you change `icon.icon/Assets/Logo.png`, regenerate the legacy pack so DMG matches:

```bash
bun run regen-legacy-icns   # updates icon.icns / icon.png (+ Tauri source)
```

**Requirements**

- Full **Xcode 26+** (not only Command Line Tools) so `actool --version` ≥ 26
- CI: `macos-26` / `macos-26-intel` runners (see `release-desktop-electron.yml`)

**Local package**

```bash
just build-desktop
# or
cd apps/desktop-electron && bun run package
```

Without Xcode 26, package falls back to `icon.icns` only and warns. Force that path:

```bash
ATMOS_ELECTRON_ICON_LEGACY=1 bun run package
```

CI always requires Liquid Glass (`CI=true`).

**Edit Liquid Glass artwork**

1. Update `icon.icon/Assets/Logo.png` (1024×1024, transparent, logo only — no squircle plate) and/or `icon.json`
2. Optionally open `icon.icon` in Apple Icon Composer for glass tuning
3. Re-package on a machine with Xcode 26+

Do **not** delete `icon.icon/` when re-syncing Tauri bitmaps — `sync-icons` only copies listed bitmap/icns/ico files.
