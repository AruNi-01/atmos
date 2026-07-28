# Desktop Application (Tauri) — **DEPRECATED**

> ⚠️ **DEPRECATED. Do not implement features or ship from this package.**  
> **All desktop product work goes to** [`apps/desktop-electron`](../desktop-electron/AGENTS.md).  
> Commands: `just dev-desktop` · `just build-desktop` · `just release-desktop` · `/atmos-desktop-release`

## Rule for agents and humans

| Do | Don't |
|----|--------|
| Edit **`apps/desktop-electron/**`** for any desktop shell change | Edit `apps/desktop/**` for new features, fixes, or UX |
| Release via `just release-desktop` / `/atmos-desktop-release` | Cut Tauri `desktop-*` production releases |
| Point docs/commands at production desktop | Treat this tree as the default desktop |

This tree (`apps/desktop` + Tauri) is **read-mostly**: emergency/local reference only. Production product identity is **Atmos** / `com.atmos.desktop` under `apps/desktop-electron`.

- Secondary identity (if you must open this shell): `com.atmos.desktop.tauri` / `Atmos (Tauri)`
- **No production release** from this package (`release-desktop.yml` is deprecated)

## Local only (discouraged)

```bash
just dev-desktop-tauri    # deprecation warning
just build-desktop-tauri  # deprecation warning
```

Prefer:

```bash
just dev-desktop
just build-desktop
just release-desktop <version>
```

## Runtime note

Sidecar layout under `apps/desktop/src-tauri/binaries/runtime/current/` is still the **shared** prepare-sidecar output consumed by production packaging. Do not delete that path without updating `apps/desktop-electron` prepare/package scripts. **Do not** put product logic back into Tauri `src-tauri` for ship.

## NEVER

- Implement desktop features here instead of `apps/desktop-electron`
- Advertise this shell as the product desktop
- Run Tauri release automation for production ship
- Point production updater feeds at this package
