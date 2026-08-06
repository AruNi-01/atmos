# Highlight helper (macOS)

Desktop chrome for operation border and under-pointer status while Desktop Use drives the UI.

## Layout

- `highlight_overlay.swift` — source (edit here)
- `prebuilt/atmos-desktop-highlight` — universal (`arm64` + `x86_64`) binary shipped with the crate

Production installs the prebuilt binary into `~/.atmos/desktop-use/bin/`. Runtime does **not** require `swiftc`.

## Rebuild prebuilt (maintainers)

```bash
swiftc -O -target arm64-apple-macos13 -o /tmp/hl-arm64 highlight_overlay.swift
swiftc -O -target x86_64-apple-macos13 -o /tmp/hl-x64 highlight_overlay.swift
lipo -create /tmp/hl-arm64 /tmp/hl-x64 -output prebuilt/atmos-desktop-highlight
```

Dev override: set `ATMOS_DESKTOP_USE_BUILD_HELPERS=1` to compile from source with local `swiftc` instead of the prebuilt.
