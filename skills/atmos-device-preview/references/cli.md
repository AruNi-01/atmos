# `atmos simulator` CLI reference

Product contract for Device Preview. Always JSON stdout (`ok`, `result`,
`error.code`). Do **not** pass `--json`. Do not use `atmos call simulator_*`.

Workspace: sticky `atmos context set --workspace <id>`, overridable
`--workspace` on the command.

## Lifecycle

```bash
atmos simulator probe
atmos simulator start [--platform ios|android] [--udid …]
atmos simulator stop
atmos simulator status
atmos simulator list
```

`start` / `stop` / `probe` only when the user asked to open, close, or inspect
preview. **Never** as a side effect of tap.

`status` for agents: `{ udid, name, platform, helper, workspace_id }`.
Do **not** use `url` / `port`.

`list` is Computer-wide live claims. Each row: `name · platform · project or
workspace` (flag `current` when it is this workspace). Use `udid` from the row.

## Control

```bash
atmos simulator screenshot [--udid ID] [--platform ios|android] [--out PATH]
atmos simulator tap --x <0..1> --y <0..1> [--udid ID] [--platform ios|android]
atmos simulator swipe --x1 --y1 --x2 --y2 [--duration-ms N] [--udid ID]
atmos simulator type --text "…" [--udid ID]
atmos simulator press --key home|back|recents [--udid ID]
```

v1 requires a live claim. `screenshot` / `tap` / `swipe` / `type` / `press`
must not start the preview.

Default screenshot dest (when `--out` omitted):

```text
~/.atmos/tmp/device-preview/<workspace_id>/screenshot-<unix_ms>.png
```

`screenshot` `result` includes `path`, `width`, `height`. Read the PNG; then
`--x = px / width`, `--y = py / height` (normalized 0..1). Mixing Desktop Use
`--coord-space png` here is a bug.

`--udid` is the device handle (iOS UDID / Android AVD id). `--platform` is not
unique.

iOS: `press --key home` only. `back` / `recents` → `UNSUPPORTED_ON_PLATFORM`.
Do not retry as Android. No `power` in v1.
