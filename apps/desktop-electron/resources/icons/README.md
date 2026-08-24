# Atmos icons (Electron shell)

## Layout

| Asset | Role |
|-------|------|
| `icon.icon/` | **macOS 26+ Liquid Glass** Icon Composer package (source). Fill is black; `Assets/Logo.png` is the white mark; `Assets/Rim.png` is a hairline edge so the tile reads on a dark Dock. electron-builder + `actool` ≥ 26 → `Assets.car` + legacy ICNS. |
| `icon.icns` | Legacy macOS **app** icon (pre-Tahoe Dock, `CFBundleIconFile`). Full-bleed plate — the system applies the squircle mask. |
| `dmg-icon.icns` | DMG **volume** + downloaded-file icon. Same plate inset ~9% so Finder's desktop well has margin (full-bleed fills the frame). |
| `icon.png` / `icon.ico` | Window chrome, Windows installer, dev `dock.setIcon` (PNG preferred). |
| `32x32.png`, `128x128*.png` | Fallback sizes |

**Cross-surface brand pack** (same black rounded-plate art as `icon.icns`, kept in lockstep by `regen-legacy-icns`):

| Asset | Role |
|-------|------|
| `crates/desktop-use/assets/host-app-icon.icns` | **Atmos Desktop Use.app** — System Settings / Accessibility / Screen Recording |
| `apps/web/public/notification-icon.png` | Default system-notification **content** icon (left side of banner) |
| `apps/{docs,landing,web}/src/app/icon.png` | Site favicons (Next.js App Router) |
| `apps/docs/src/app/apple-icon.png` + `apps/docs/public/favicon.ico` | Docs Apple touch icon and legacy favicon |

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

- `electron-builder.yml` → `mac.icon: icon.icns` (legacy **app** icon, full-bleed)
- `dmg.icon: dmg-icon.icns` — Finder disk-image icon **cannot** use Liquid Glass `Assets.car`; this icns is the same plate with canvas margin
- `afterPack: scripts/after-pack-macos-icon.cjs` runs `actool` on `icon.icon/` and injects `Assets.car` + `CFBundleIconName=Icon` into the `.app`
- Tahoe Dock/Finder for the **running/installed app** → `Assets.car`; **DMG volume / downloaded .dmg** → `dmg-icon.icns`; older macOS app icon → `icon.icns`

When you change `icon.icon/Assets/Logo.png`, regenerate **every** classic surface so nothing drifts:

```bash
bun run regen-legacy-icns
# updates:
#   resources/icons/icon.icns + dmg-icon.icns + png sizes (+ Tauri source)
#   crates/desktop-use/assets/host-app-icon.icns
#   apps/web/public/notification-icon.png
#   apps/{docs,landing,web}/src/app/icon.png
#   apps/docs/src/app/apple-icon.png + apps/docs/public/favicon.ico
```

After changing the host icns, **Atmos Desktop** copies `icon.icns` onto
`~/.atmos/desktop-use/host/Atmos Desktop Use.app/Contents/Resources/AppIcon.icns`
on boot and again after `driver ensure` (no re-sign, so TCC grants stay).
The CLI may also rewrite the same file from its embedded copy; Desktop's
copy is applied last so a stale CLI cannot keep the old vendor plate.

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

1. Update `icon.icon/Assets/Logo.png` (1024×1024, transparent white mark only — no disc, no squircle plate) and/or `icon.json` (fill is black). Hairline rim is `Assets/Rim.png` (rewritten by `regen-legacy-icns`).
2. Optionally open `icon.icon` in Apple Icon Composer for glass tuning
3. Run `bun run regen-legacy-icns` so DMG / host / notification match
4. Re-package on a machine with Xcode 26+

Do **not** delete `icon.icon/` when re-syncing Tauri bitmaps — `sync-icons` only copies listed bitmap/icns/ico files.
