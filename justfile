# ATMOS - Justfile
# Cross-language tasks via Just (https://github.com/casey/just)
# Install: brew install just (macOS) / cargo install just

# Default shell
set shell := ["zsh", "-cu"]
set positional-arguments
# set shell := ["powershell.exe", "-c"]

# List every available command
default:
    @just --list --unsorted

# ============================================
# Development
# ============================================

# Start the web dev server
# Usage:
#   just dev-web
#   just dev-web --port 3001
#   just dev-web --web-port 3001 --api-port 4040
dev-web *args:
    #!/usr/bin/env bash
    set -euo pipefail

    web_port=3030
    api_port=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -p|--port|--web-port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                web_port="$2"
                shift 2
                ;;
            --api-port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                api_port="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                echo "Usage: just dev-web [--port|-p <web-port>] [--web-port <web-port>] [--api-port <api-port>]" >&2
                exit 1
                ;;
        esac
    done

    if [[ -n "$api_port" ]]; then
        cd apps/web && NEXT_PUBLIC_API_PORT="$api_port" bun x next dev --turbopack --port "$web_port"
    else
        cd apps/web && bun x next dev --turbopack --port "$web_port"
    fi

# Start the web dev server with portless
dev-web-portless:
    bun --filter web dev:portless

# Start the landing dev server
dev-landing:
    bun --filter landing dev

# Start the landing dev server with portless
dev-landing-portless:
    bun --filter landing dev:portless

# Start the docs dev server
dev-docs:
    bun --filter docs dev

# Same as bunx expo start --dev-client. An installed app connects here; no reinstall.
# Phone and Mac must share Wi-Fi. Alias: just dm
dev-mobile:
    cd apps/mobile && bunx expo start --dev-client --scheme atmos --lan

# Start Metro for the installed Atmos Dev app. VPN is fine: uses the Wi-Fi address, not the 198.18 virtual interface.
# Bundle id land.atmos.mobile.dev. Does not replace the Release Atmos app. Alias: just dmp
dev-mobile-phone:
    #!/usr/bin/env bash
    set -euo pipefail

    is_lan_ip() {
        local ip="$1"
        [[ "$ip" == 10.* || "$ip" == 192.168.* || "$ip" == 172.1[6-9].* || "$ip" == 172.2[0-9].* || "$ip" == 172.3[0-1].* ]]
    }

    host=""
    for iface in en0 en1; do
        ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
        if [[ -n "$ip" ]] && is_lan_ip "$ip"; then
            host="$ip"
            break
        fi
    done

    if [[ -z "$host" ]]; then
        echo "No Wi-Fi address found. Connect this computer to the LAN, or turn off the proxy TUN, then try again." >&2
        exit 1
    fi

    echo "Phone URL: http://${host}:8081"
    cd apps/mobile
    REACT_NATIVE_PACKAGER_HOSTNAME="$host" bunx expo start --dev-client --scheme atmos-dev --lan

# Build and install on the iOS simulator (first run, or after a native dependency change)
mobile-ios:
    #!/usr/bin/env bash
    set -euo pipefail
    export SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"
    cd apps/mobile && bun run ios

# Expo prebuild output is gitignored. Create it once per worktree.
# An existing workspace still gets the pod deployment-target snippet if prebuild
# ran before that plugin existed. pod install applies it.
mobile-ios-prepare:
    #!/usr/bin/env bash
    set -euo pipefail
    ios_workspace="apps/mobile/ios/Atmos.xcworkspace/contents.xcworkspacedata"
    podfile="apps/mobile/ios/Podfile"
    marker="Atmos raises pod deployment targets"
    if [[ -f "$ios_workspace" ]]; then
        if [[ -f "$podfile" ]] && ! grep -q "$marker" "$podfile"; then
            node -e '
                const fs = require("fs");
                const { ensurePodDeploymentTarget } = require("./apps/mobile/plugins/with-ios-pod-deployment-target");
                const path = "apps/mobile/ios/Podfile";
                fs.writeFileSync(path, ensurePodDeploymentTarget(fs.readFileSync(path, "utf8")));
            '
            (cd apps/mobile/ios && pod install)
        fi
        exit 0
    fi
    cd apps/mobile
    CI=1 bunx expo prebuild --platform ios

# Build the Release app and install it on a connected iPhone. Does not use Metro.
# Installs as Atmos (land.atmos.mobile). Does not replace Atmos Dev.
# Usage: just mobile-ios-release
#       just mobile-ios-release 00008120-000108901432201E
mobile-ios-release *args:
    #!/usr/bin/env bash
    set -euo pipefail
    unset EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_DEVICE EXPO_PUBLIC_ATMOS_MOBILE_DEV_DEVICE_SETTINGS_URL
    export SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"

    if [[ $# -gt 0 ]]; then
        device="$1"
    else
        device="$(xcrun devicectl list devices 2>/dev/null | awk '
            /physical/ && $0 !~ /shutdown|unavailable/ {
                for (i = 1; i <= NF; i++) if ($i ~ /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$/) { print $i; exit }
            }
        ')"
    fi
    if [[ -z "${device:-}" ]]; then
        echo "No connected iPhone found. Plug it in and unlock it, or run: just mobile-ios-release <UDID>" >&2
        xcrun devicectl list devices >&2 || true
        exit 1
    fi

    just mobile-ios-prepare
    ios_dir="apps/mobile/ios"
    xcodebuild \
        -workspace "$ios_dir/Atmos.xcworkspace" \
        -scheme Atmos \
        -configuration Release \
        -destination "generic/platform=iOS" \
        -allowProvisioningUpdates \
        PRODUCT_BUNDLE_IDENTIFIER=land.atmos.mobile \
        DEVELOPMENT_TEAM=2PNT5GQDAK \
        CODE_SIGN_STYLE=Automatic \
        build

    # find -quit can return a stale DerivedData tree first. Install the newest Release app.
    app="$(find "$HOME/Library/Developer/Xcode/DerivedData" -path '*/Build/Products/Release-iphoneos/Atmos.app/Info.plist' ! -path '*/Index.noindex/*' -print0 | xargs -0 stat -f '%m %N' | sort -nr | head -1 | cut -d' ' -f2-)"
    app="${app%/Info.plist}"
    if [[ -z "$app" || ! -d "$app" ]]; then
        echo "Built Atmos.app was not found." >&2
        exit 1
    fi
    bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")"
    display_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$app/Info.plist")"
    if [[ "$bundle_id" != "land.atmos.mobile" || "$display_name" != "Atmos" ]]; then
        echo "Build is not Release Atmos ($display_name / $bundle_id). Install stopped." >&2
        exit 1
    fi
    xcrun devicectl device install app --device "$device" "$app"
    echo "Installed $display_name ($bundle_id)"

# Build Atmos Dev and install it on a connected iPhone. Live reload needs Metro.
# Installs as Atmos Dev (land.atmos.mobile.dev). Does not replace the Release Atmos app.
# After install, start Metro with just dev-mobile-phone.
# Usage: just mobile-ios-dev
#       just mobile-ios-dev 00008120-000108901432201E
mobile-ios-dev *args:
    #!/usr/bin/env bash
    set -euo pipefail
    export SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"

    if [[ $# -gt 0 ]]; then
        device="$1"
    else
        device="$(xcrun devicectl list devices 2>/dev/null | awk '
            /physical/ && $0 !~ /shutdown|unavailable/ {
                for (i = 1; i <= NF; i++) if ($i ~ /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$/) { print $i; exit }
            }
        ')"
    fi
    if [[ -z "${device:-}" ]]; then
        echo "No connected iPhone found. Plug it in and unlock it, or run: just mobile-ios-dev <UDID>" >&2
        xcrun devicectl list devices >&2 || true
        exit 1
    fi

    just mobile-ios-prepare
    ios_dir="apps/mobile/ios"
    plist="$ios_dir/Atmos/Info.plist"
    backup="$(mktemp)"
    cp "$plist" "$backup"
    restore_plist() { cp "$backup" "$plist"; }
    trap restore_plist EXIT
    /usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName Atmos Dev' "$plist"
    /usr/libexec/PlistBuddy -c 'Set :CFBundleURLTypes:0:CFBundleURLSchemes:0 atmos-dev' "$plist"
    /usr/libexec/PlistBuddy -c 'Set :CFBundleURLTypes:0:CFBundleURLSchemes:1 land.atmos.mobile.dev' "$plist"
    /usr/libexec/PlistBuddy -c 'Set :CFBundleURLTypes:1:CFBundleURLSchemes:0 exp+atmos-mobile-dev' "$plist"

    xcodebuild \
        -workspace "$ios_dir/Atmos.xcworkspace" \
        -scheme Atmos \
        -configuration Debug \
        -destination "generic/platform=iOS" \
        -allowProvisioningUpdates \
        PRODUCT_BUNDLE_IDENTIFIER=land.atmos.mobile.dev \
        DEVELOPMENT_TEAM=2PNT5GQDAK \
        CODE_SIGN_STYLE=Automatic \
        build

    app="$(find "$HOME/Library/Developer/Xcode/DerivedData" -path '*/Build/Products/Debug-iphoneos/Atmos.app/Info.plist' ! -path '*/Index.noindex/*' -print0 | xargs -0 stat -f '%m %N' | sort -nr | head -1 | cut -d' ' -f2-)"
    app="${app%/Info.plist}"
    if [[ -z "$app" || ! -d "$app" ]]; then
        echo "Built Atmos Dev app was not found." >&2
        exit 1
    fi
    bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")"
    display_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$app/Info.plist")"
    if [[ "$bundle_id" != "land.atmos.mobile.dev" || "$display_name" != "Atmos Dev" ]]; then
        echo "Build is not Atmos Dev ($display_name / $bundle_id). Install stopped." >&2
        exit 1
    fi
    xcrun devicectl device install app --device "$device" "$app"
    echo "Installed $display_name ($bundle_id). For live reload, run just dev-mobile-phone"

# Build and install a same-bundle-id Debug app on a connected iPhone. This replaces the Release Atmos app.
# To keep Release installed beside Dev, use just mobile-ios-dev.
# Usage: just mobile-ios-device
#       just mobile-ios-device 00008120-000108901432201E
mobile-ios-device *args:
    #!/usr/bin/env bash
    set -euo pipefail
    export SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"
    cd apps/mobile
    if [[ $# -gt 0 ]]; then
        bunx expo run:ios --device "$@"
    else
        bunx expo run:ios --device
    fi

# Build and install on an Android device or emulator
mobile-android:
    cd apps/mobile && bun run android

# ── Desktop (Electron is the production default shell) ──────────────────────
# prepare-sidecar stages shared Atmos Server + web static under the runtime layout.
# Faster re-run: ATMOS_DESKTOP_SKIP_WEB_BUILD=1 just dev-desktop
# Skip prepare if runtime already present: ATMOS_ELECTRON_SKIP_PREPARE=1 just dev-desktop
dev-desktop:
    cd apps/desktop-electron && bun run dev

# Alias kept for clarity / muscle memory
dev-desktop-electron:
    just dev-desktop

# Deprecated Tauri shell (apps/desktop) — local-only; not for release.
dev-desktop-tauri:
    @echo "⚠️  apps/desktop (Tauri) is deprecated. Prefer: just dev-desktop"
    bash ./scripts/desktop/prepare-sidecar.sh && cd apps/desktop && bun run tauri dev --no-watch --no-dev-server-wait --config src-tauri/tauri.debug.conf.json

# Start the desktop backend only (dev mode, cargo run)
dev-desktop-backend:
    RUST_LOG=info cargo run --bin api

# Deprecated Tauri debug mode
dev-desktop-debug:
    @echo "⚠️  apps/desktop (Tauri) is deprecated. Prefer: just dev-desktop"
    bash ./scripts/desktop/prepare-sidecar.sh && cd apps/desktop && ATMOS_DESKTOP_DEBUG=true RUST_LOG=info bun run tauri dev --no-watch --no-dev-server-wait --config src-tauri/tauri.debug.conf.json --verbose

# Headless desktop smokes (no GUI): router + ensure Server + get_api_config
test-desktop-electron-smoke:
    cd apps/desktop-electron && bun run smoke:router && bun run smoke:boot

# Package production desktop installers (DMG/NSIS/AppImage). Requires prepare-sidecar first.
build-desktop:
    bash ./scripts/desktop/prepare-sidecar.sh
    cd apps/desktop-electron && bun run package

build-desktop-electron:
    just build-desktop

# Deprecated Tauri package (local only — do not use for shipping)
build-desktop-tauri:
    @echo "⚠️  Deprecated: Tauri package is not the production ship path. Prefer: just build-desktop"
    bash ./scripts/desktop/prepare-sidecar.sh
    cd apps/desktop && bun run tauri build

# Bump production desktop version (apps/desktop-electron/package.json)
bump-desktop-version version *args:
    node ./scripts/release/bump-desktop-electron-version.mjs "{{version}}" {{args}}

bump-desktop-electron-version version *args:
    just bump-desktop-version {{version}} {{args}}

# Production desktop release (Electron ship path). Same as /atmos-desktop-release.
#   just release-desktop 2026.7.28
#   just release-desktop 2026.7.28 --dry-run
release-desktop version *args:
    node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs "{{version}}" {{args}}

release-desktop-electron version *args:
    just release-desktop {{version}} {{args}}

release-desktop-dry-run version *args:
    node ./.agents/skills/atmos-desktop-release/scripts/atmos-desktop-release.mjs "{{version}}" --dry-run {{args}}

release-desktop-electron-dry-run version *args:
    just release-desktop-dry-run {{version}} {{args}}

# Start the API server
# Runs cargo run directly so Ctrl+C reaches the process, instead of the shell exiting first and scrambling the output
# For hot reload, use dev-api-watch
# Usage:
#   just dev-api
#   just dev-api --port 4040
#   just dev-api -p 4040
#   just dev-api --port 4040 --web-port 3001
#   just dev-api --port 4040 --cleanup-stale-clients false
dev-api *args:
    #!/usr/bin/env bash
    set -euo pipefail

    port=""
    web_port=""
    cleanup_stale_clients="true"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -p|--port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                port="$2"
                shift 2
                ;;
            --web-port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                web_port="$2"
                shift 2
                ;;
            --cleanup-stale-clients)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                cleanup_stale_clients="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                echo "Usage: just dev-api [--port|-p <port>] [--web-port <web-port>] [--cleanup-stale-clients <true|false>]" >&2
                exit 1
                ;;
        esac
    done

    if [[ -n "$web_port" ]]; then
        export CORS_ORIGIN="http://localhost:${web_port},http://127.0.0.1:${web_port}"
    fi

    # Linear OAuth finish persists tokens on Hub (core-service). Prefer explicit env;
    # fall back to web's NEXT_PUBLIC_ / prod Hub so local API is not misconfigured.
    if [[ -z "${ATMOS_HUB_URL:-}" && -z "${NEXT_PUBLIC_ATMOS_HUB_URL:-}" ]]; then
        export ATMOS_HUB_URL="https://hub.atmos.land"
    fi

    if [[ -n "$port" ]]; then
        cargo run --bin api -- --port "$port" --cleanup-stale-clients "$cleanup_stale_clients"
    else
        cargo run --bin api -- --cleanup-stale-clients "$cleanup_stale_clients"
    fi

# Start Atmos Hub (Better Auth / devices / integrations; packages/hub wrangler dev)
# Usage:
#   just dev-hub
#   just dev-hub --port 8787
#   just dh
# Requires packages/hub/.dev.vars (secrets). Default http://localhost:8787
dev-hub *args:
    #!/usr/bin/env bash
    set -euo pipefail

    port=8787

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -p|--port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                port="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                echo "Usage: just dev-hub [--port|-p <port>]" >&2
                exit 1
                ;;
        esac
    done

    if [[ ! -f packages/hub/.dev.vars ]]; then
        echo "Missing packages/hub/.dev.vars — copy from .dev.vars.example and fill secrets." >&2
        exit 1
    fi

    cd packages/hub
    echo "Atmos Hub → http://localhost:${port}  (BETTER_AUTH_URL in .dev.vars should match)"
    bunx wrangler dev --port "$port"

# Start the API server with hot reload. On Ctrl+C, cargo watch may exit first and scramble the output
dev-api-watch *args:
    #!/usr/bin/env bash
    set -euo pipefail

    port=""
    web_port=""
    cleanup_stale_clients="true"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -p|--port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                port="$2"
                shift 2
                ;;
            --web-port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                web_port="$2"
                shift 2
                ;;
            --cleanup-stale-clients)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                cleanup_stale_clients="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                echo "Usage: just dev-api-watch [--port|-p <port>] [--web-port <web-port>] [--cleanup-stale-clients <true|false>]" >&2
                exit 1
                ;;
        esac
    done

    if [[ -n "$web_port" ]]; then
        export CORS_ORIGIN="http://localhost:${web_port},http://127.0.0.1:${web_port}"
    fi

    if [[ -z "${ATMOS_HUB_URL:-}" && -z "${NEXT_PUBLIC_ATMOS_HUB_URL:-}" ]]; then
        export ATMOS_HUB_URL="https://hub.atmos.land"
    fi

    if [[ -n "$port" ]]; then
        cargo watch -x "run --bin api -- --port $port --cleanup-stale-clients $cleanup_stale_clients" -w apps/api -w crates
    else
        cargo watch -x "run --bin api -- --cleanup-stale-clients $cleanup_stale_clients" -w apps/api -w crates
    fi

# Run CLI help
dev-cli:
    cargo run --bin atmos -- --help

# Start every dev server in parallel
# Usage:
#   just dev-all
#   just dev-all --web-port 3001 --api-port 4040
#   just dev-all --web-port 3001 --api-port 4040 --cleanup-stale-clients false
dev-all *args:
    #!/usr/bin/env bash
    set -euo pipefail

    web_port=3030
    api_port=30303
    cleanup_stale_clients="true"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --web-port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                web_port="$2"
                shift 2
                ;;
            --api-port)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                api_port="$2"
                shift 2
                ;;
            --cleanup-stale-clients)
                [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 1; }
                cleanup_stale_clients="$2"
                shift 2
                ;;
            *)
                echo "Unknown option: $1" >&2
                echo "Usage: just dev-all [--web-port <web-port>] [--api-port <api-port>] [--cleanup-stale-clients <true|false>]" >&2
                exit 1
                ;;
        esac
    done

    echo "Starting dev servers... web=${web_port} api=${api_port}"
    just dev-web --web-port "$web_port" --api-port "$api_port" & just dev-api --port "$api_port" --web-port "$web_port" --cleanup-stale-clients "$cleanup_stale_clients"

# ============================================
# Release / Version
# ============================================

# Check the production desktop version (apps/desktop-electron/package.json)
check-desktop-version:
    node -e "const p=require('./apps/desktop-electron/package.json'); if(!p.version) process.exit(1); console.log('desktop-electron version', p.version);"

# ============================================
# Build
# ============================================
# Build the API server (release)
build-api:
    cargo build --release --bin api

# Build the CLI (release)
build-cli:
    cargo build --release --bin atmos

# Build the local web runtime artifacts (api + atmos + web)
build-local-runtime *args:
    node ./scripts/local-runtime/build-runtime.mjs {{args}}

# Pack vendored serve-sim into a darwin-arm64 archive (APP-060).
#   just pack-serve-sim
#   just pack-serve-sim --install
pack-serve-sim *args:
    bash scripts/serve-sim/pack.sh {{args}}

# Pack vendored serve-emu into a darwin-arm64 archive (APP-070).
#   just pack-serve-emu
#   just pack-serve-emu --install
pack-serve-emu *args:
    bash scripts/serve-emu/pack.sh {{args}}

# Build every Rust package
build-rust:
    cargo build --release --workspace

# Build every project
build-all:
    bun run build
    cargo build --release --workspace

# ============================================
# Install
# ============================================

# Install the CLI into cargo bin (~/.cargo/bin/atmos)
install-cli:
    cargo install --path apps/cli

# Replace the local atmos binary with this repo's latest CLI
# Writes ~/.atmos/bin/atmos, and also ~/.cargo/bin/atmos when that directory exists
# Usage: just use-local-cli
use-local-cli:
    #!/usr/bin/env bash
    set -euo pipefail
    root="{{justfile_directory()}}"
    cargo build --release -p atmos --manifest-path "${root}/apps/cli/Cargo.toml"
    src="${root}/target/release/atmos"
    if [[ ! -x "$src" ]]; then
      echo "error: release binary missing: ${src}" >&2
      exit 1
    fi
    dest_dir="${HOME}/.atmos/bin"
    mkdir -p "$dest_dir"
    install -m 755 "$src" "${dest_dir}/atmos"
    if [[ -d "${HOME}/.cargo/bin" ]]; then
      install -m 755 "$src" "${HOME}/.cargo/bin/atmos"
    fi
    hash -r 2>/dev/null || true
    echo "replaced: ${dest_dir}/atmos"
    if [[ -x "${HOME}/.cargo/bin/atmos" ]]; then
      echo "replaced: ${HOME}/.cargo/bin/atmos"
    fi
    echo -n "version: "
    "${dest_dir}/atmos" --version
    if command -v atmos >/dev/null 2>&1; then
      echo "path:    $(command -v atmos)"
    else
      echo "path:    atmos not on PATH — add export PATH=\"\$HOME/.atmos/bin:\$PATH\""
    fi

# Install every dependency
install-deps:
    bun install
    cargo fetch

# ============================================
# Code quality
# ============================================

# Run every lint check
lint:
    bun lint
    cargo clippy --workspace

# TypeScript 7 native typecheck across workspaces (QUALITY-005)
typecheck:
    bun run typecheck

# Typecheck wall-time vs QUALITY-005 baseline
typecheck-bench:
    bun run typecheck:bench

# Format all code
fmt:
    bun run prettier --write .
    cargo fmt --all

# Check formatting without writing files
fmt-check:
    bun run prettier --check .
    cargo fmt --all --check

# ============================================
# Testing
# ============================================

# Run every test
test:
    bun test
    cargo test --workspace

# Run Playwright end-to-end tests
test-e2e *args:
    bun run --cwd e2e test -- {{args}}

# Run Playwright end-to-end smoke tests
test-e2e-smoke *args:
    bun run --cwd e2e test:smoke -- {{args}}

# Run Playwright end-to-end tests in headed mode
test-e2e-headed *args:
    bun run --cwd e2e test:headed -- {{args}}

# Install the Playwright Chromium browser
install-e2e-browsers:
    bun run --cwd e2e install:browsers

# Open the latest Playwright HTML report
e2e-report:
    bun run --cwd e2e report

# Run frontend tests only
test-web:
    bun test

# Run Rust tests only
test-rust:
    cargo test --workspace

# Run API tests
test-api:
    cargo test --package api

# Run tests and show coverage
test-coverage:
    cargo test --workspace -- --nocapture
    cargo tarpaulin --workspace --out Html

# ============================================
# Clean
# ============================================

# Remove every build artifact
clean:
    rm -rf node_modules
    rm -rf .next
    rm -rf target
    bun pm cache rm

# Remove Rust build artifacts
clean-rust:
    cargo clean

# Remove Node modules
clean-node:
    rm -rf node_modules
    rm -rf apps/*/node_modules
    rm -rf packages/*/node_modules

# ============================================
# Utilities
# ============================================

# Update every dependency
update:
    bun update
    cargo update

# Check for outdated dependencies
outdated:
    bun outdated
    cargo outdated

# Run a security audit
audit:
    bun audit
    cargo audit

# Show project info
info:
    @echo "=== Bun version ==="
    @bun --version
    @echo "\n=== Cargo version ==="
    @cargo --version
    @echo "\n=== Rust version ==="
    @rustc --version
    @echo "\n=== Node version ==="
    @node --version

# ============================================
# Composite
# ============================================

# Full CI flow: lint + test + build
ci: lint test build-all
    @echo "CI finished"

# Pre-commit check: fmt + lint + test
pre-commit: fmt lint test
    @echo "Pre-commit check finished"

# Clean everything and reinstall dependencies
fresh: clean install-deps
    @echo "Project refreshed"

# ============================================
# Aliases
# ============================================

alias dw := dev-web
alias dwp := dev-web-portless
alias dd := dev-desktop
alias dde := dev-desktop-electron
alias ddt := dev-desktop-tauri
alias bde := build-desktop-electron
alias ddb := dev-desktop-backend
alias dl := dev-landing
alias dlp := dev-landing-portless
alias d-d := dev-docs
alias dm := dev-mobile
alias dmp := dev-mobile-phone
alias mio := mobile-ios
alias mid := mobile-ios-device
alias ma := mobile-android
alias da := dev-api
alias dh := dev-hub
alias t := test
alias te := test-e2e
alias tes := test-e2e-smoke
alias ta := test-api
alias tc := typecheck
alias l := lint
alias f := fmt
alias c := clean
