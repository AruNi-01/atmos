#!/usr/bin/env bash
# Pack the vendored serve-sim fork into a darwin-arm64 archive.
# Usage:
#   scripts/serve-sim/pack.sh
#   scripts/serve-sim/pack.sh --install
#   scripts/serve-sim/pack.sh --out-dir /tmp/serve-sim-dist
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VENDOR="$ROOT/vendor/serve-sim/packages/serve-sim"
PIN="$ROOT/apps/api/simulator/serve-sim-requirement.json"
INSTALL=0
OUT_DIR="$ROOT/dist/serve-sim"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install) INSTALL=1; shift ;;
    --out-dir)
      [[ $# -ge 2 ]] || { echo "Missing value for --out-dir" >&2; exit 1; }
      OUT_DIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "pack-serve-sim requires macOS" >&2
  exit 1
fi
if [[ "$(uname -m)" != "arm64" ]]; then
  echo "pack-serve-sim requires Apple Silicon" >&2
  exit 1
fi
command -v bun >/dev/null || { echo "bun is required to pack serve-sim" >&2; exit 1; }

# SwiftPM may try the macOS keychain for public GitHub artifacts and abort
# with status -128. Prefer a one-shot netrc from `gh` when available.
export GIT_TERMINAL_PROMPT=0
if command -v gh >/dev/null 2>&1; then
  if TOKEN="$(gh auth token 2>/dev/null)" && [[ -n "$TOKEN" ]]; then
    NETRC="$(mktemp)"
    umask 077
    printf 'machine github.com login x-access-token password %s\n' "$TOKEN" > "$NETRC"
    export NETRC
    trap 'rm -f "$NETRC"' EXIT
  fi
fi

VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$PIN")"
ASSET="serve-sim-${VERSION}-darwin-arm64.tar.gz"
STAGE="$OUT_DIR/serve-sim-${VERSION}-darwin-arm64"

mkdir -p "$OUT_DIR"
rm -rf "$STAGE"
mkdir -p "$STAGE/native"

echo "[pack-serve-sim] building vendor at $VENDOR"
(
  cd "$ROOT/vendor/serve-sim"
  bun install --frozen-lockfile
  cd packages/serve-sim
  bun run build
)

BIN="$VENDOR/dist/serve-sim"
NODE="$VENDOR/dist/native/serve-sim-native.node"
[[ -x "$BIN" ]] || { echo "missing compiled binary: $BIN" >&2; exit 1; }
[[ -f "$NODE" ]] || { echo "missing native addon: $NODE" >&2; exit 1; }

cp "$BIN" "$STAGE/serve-sim"
chmod +x "$STAGE/serve-sim"
cp "$NODE" "$STAGE/native/serve-sim-native.node"
cp "$ROOT/vendor/serve-sim/LICENSE" "$STAGE/LICENSE"
cp "$ROOT/vendor/serve-sim/ATMOS-PATCHES.md" "$STAGE/ATMOS-PATCHES.md"
# The compiled addon dlopens LiveKitWebRTC next to the binary
# (`@loader_path/../bin/LiveKitWebRTC.framework`).
if [[ -d "$VENDOR/dist/bin/LiveKitWebRTC.framework" ]]; then
  mkdir -p "$STAGE/bin"
  cp -R "$VENDOR/dist/bin/LiveKitWebRTC.framework" "$STAGE/bin/"
fi
if [[ -f "$VENDOR/dist/simax/serve-sim-ax-settings" ]]; then
  mkdir -p "$STAGE/simax"
  cp "$VENDOR/dist/simax/serve-sim-ax-settings" "$STAGE/simax/"
fi

ARCHIVE="$OUT_DIR/$ASSET"
tar -C "$OUT_DIR" -czf "$ARCHIVE" "serve-sim-${VERSION}-darwin-arm64"
SHA256="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"

python3 - "$PIN" "$VERSION" "$ASSET" "$SHA256" "$STAGE/manifest.json" "$OUT_DIR/manifest.json" <<'PY'
import json, sys
pin_path, version, asset, sha256, staged, published = sys.argv[1:]
pin = json.load(open(pin_path))
manifest = {
    "name": "serve-sim",
    "version": version,
    "minos": pin.get("minos", "14.0"),
    "arch": "arm64",
    "asset": asset,
    "sha256": sha256,
    "upstream_commit": pin.get("upstream_commit", ""),
}
for dest in (staged, published):
    with open(dest, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
print(f"wrote {published}")
print(f"sha256 {sha256}")
print("pin sha256 left unchanged; Desktop reads Release manifest.json")
PY

echo "[pack-serve-sim] archive $ARCHIVE"

if [[ "$INSTALL" -eq 1 ]]; then
  DEST="${HOME}/.atmos/runtime/serve-sim/${VERSION}"
  mkdir -p "$(dirname "$DEST")"
  rm -rf "$DEST"
  cp -R "$STAGE" "$DEST"
  chmod +x "$DEST/serve-sim"
  echo "[pack-serve-sim] installed $DEST"
fi
