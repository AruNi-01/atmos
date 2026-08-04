# `atmos desktop-use` CLI reference

Machine-friendly: pass `--json` on the root command.

## status

```bash
atmos desktop-use --json status
```

Key fields:

- `product` — `"Desktop Use"`
- `data_dir` — e.g. `~/.atmos/desktop-use`
- `capture.available` / `capture.platform`
- `driver.installed`, `driver.phase`, `driver.engine_path`, `driver.engine_version`
- `installed_version`, `pinned_version`, `update_available`
- `host_app_name`, `host_app_path`

## doctor

```bash
atmos desktop-use --json doctor
```

Key fields:

- `host_app_name`, `host_bundle_id` (expect `Atmos Desktop Use` / `com.atmos.desktop.use`)
- `engine_installed`, `engine_ready`
- `accessibility`, `screen_recording` — booleans or null
- `notes[]` — vendor-scrubbed hints

## driver

```bash
atmos desktop-use --json driver ensure
atmos desktop-use --json driver ensure --force
atmos desktop-use --json driver status
atmos desktop-use --json driver stop
atmos desktop-use --json driver uninstall
atmos desktop-use --json driver grant-permissions --target accessibility
atmos desktop-use --json driver grant-permissions --target screen_recording
atmos desktop-use --json driver grant-permissions --target all
```

`grant-permissions` opens **System Settings** Privacy panes only. It does not complete TCC for the user.

## capture

```bash
atmos desktop-use --json capture
atmos desktop-use --json capture --out /path/to/out.png
atmos desktop-use --json capture --out /path/to/out.png --base64
```

Returns structured capture JSON (`ok`, app/window identity, `png_base64` / `png_path`, `warnings`, …).

## drive

```bash
atmos desktop-use --json drive screenshot
atmos desktop-use --json drive screenshot --out /path/to/out.png
# Desktop-scope PNG pixels. Default delivery=background (no persistent fronting).
atmos desktop-use --json drive click --x <n> --y <n> [--coord-space png|points] [--delivery-mode background|foreground]
# True background AX click (preferred when tree is non-empty):
atmos desktop-use --json drive window-state --pid <pid> --window-id <id>
atmos desktop-use --json drive click --element-token '<token>' [--pid <pid>] [--window-id <id>]
# Logical points (list_windows bounds / AX positions):
atmos desktop-use --json drive click --x <n> --y <n> --coord-space points
# Window-local pixels:
atmos desktop-use --json drive click --x <n> --y <n> --window-id <id> [--pid <n>]
atmos desktop-use --json drive type --text "..." [--pid <n>] [--window-id <n>] [--delivery-mode background|foreground]
# Border highlight (auto on click/type; or explicit):
atmos desktop-use --json drive highlight --mode desktop
atmos desktop-use --json drive highlight --mode window --x N --y N --width N --height N
atmos desktop-use --json drive highlight --mode clear
# End run: clear blinking border + engine session cursor
atmos desktop-use --json drive session-end
# Prefs (also in Settings → Desktop Use → Operation border)
atmos desktop-use --json prefs get
atmos desktop-use --json prefs set --operation-border true|false
atmos desktop-use --json prefs set --highlight-idle-ms 8000
# List windows (there is no `drive windows` subcommand)
atmos desktop-use --json drive verify
```

`click` / `type` / `verify` require the control engine.  
`screenshot` prefers the host engine when installed; otherwise local capture.

Screenshot JSON includes `screen_width` / `screenshot_width` (and heights). On Retina, `screenshot_*` is often **2×** `screen_*`. Default click coords are **PNG pixels**.

### Click coordinate contract (engine 0.17)

| Flags | Coordinate space | Notes |
|-------|------------------|-------|
| `--x --y` only | **PNG pixels** (`--coord-space png`, default) | From `drive screenshot` image. CLI sends `scope=desktop`. Session + `move_cursor` for visibility. |
| `--x --y --coord-space points` | **Logical points** | Same as window bounds / AX; CLI scales to PNG before the engine. |
| `--x --y --window-id` | **Window-local** image pixels | Optional `--pid`. |
| `--x --y --pid` (no window_id) | **Ignored pid** | CLI strips bare `--pid` so desktop coords stay valid. |

`delivery_mode`:

- `background` (default): no focus steal when possible  
- `foreground`: briefly front target (`window_id` recommended) for stubborn Electron UIs

`session`: defaults to `atmos-desktop-use` so the engine agent cursor stays active. Pass `--session ''` to disable.

### Structured errors

- `error_code: "control_engine_not_installed"`
- `error_code: "control_engine_failed"`
- `error_code: "invalid_args"`
- `error_code: "screenshot_missing"`

## Paths

Default data directory: `~/.atmos/desktop-use/`

- `bin/atmos-desktop-control` — managed engine shim
- `host/Atmos Desktop Use.app` — macOS host for unified TCC
- `engine.sock` — daemon socket
- `installed.json` — recorded install version

## Offline / CI

- `ATMOS_DESKTOP_USE_ENGINE_ARCHIVE` — local package tarball
- `ATMOS_DESKTOP_USE_ENGINE_SOURCE` — raw engine binary path
- `ATMOS_DESKTOP_USE_SKIP_DOWNLOAD=1` — force ensure failure without network
