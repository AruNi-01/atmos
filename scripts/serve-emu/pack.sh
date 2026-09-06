#!/usr/bin/env bash
# Pack the vendored serve-emu fork into a darwin-arm64 archive.
# Usage:
#   scripts/serve-emu/pack.sh
#   scripts/serve-emu/pack.sh --install
#   scripts/serve-emu/pack.sh --out-dir /tmp/serve-emu-dist
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VENDOR="$ROOT/vendor/serve-emu/packages/serve-emu"
PIN="$ROOT/crates/core-service/pins/serve-emu-requirement.json"
INSTALL=0
OUT_DIR="$ROOT/dist/serve-emu"

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
  echo "pack-serve-emu requires macOS" >&2
  exit 1
fi
if [[ "$(uname -m)" != "arm64" ]]; then
  echo "pack-serve-emu requires Apple Silicon" >&2
  exit 1
fi
command -v bun >/dev/null || { echo "bun is required to pack serve-emu" >&2; exit 1; }

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
ASSET="serve-emu-${VERSION}-darwin-arm64.tar.gz"
STAGE="$OUT_DIR/serve-emu-${VERSION}-darwin-arm64"

mkdir -p "$OUT_DIR"
rm -rf "$STAGE"
mkdir -p "$STAGE/vendor"

echo "[pack-serve-emu] building vendor at $VENDOR"
(
  cd "$ROOT/vendor/serve-emu"
  bun install --frozen-lockfile
  cd packages/serve-emu
  bun run setup
  bun build --compile --minify src/cli.ts --outfile dist/serve-emu
)

BIN="$VENDOR/dist/serve-emu"
[[ -x "$BIN" ]] || { echo "missing compiled binary: $BIN" >&2; exit 1; }
SCRCPY="$VENDOR/vendor/scrcpy-server-v4.0"
[[ -f "$SCRCPY" ]] || { echo "missing $SCRCPY (bun run setup must fetch scrcpy-server)" >&2; exit 1; }

cp "$BIN" "$STAGE/serve-emu"
chmod +x "$STAGE/serve-emu"
cp "$SCRCPY" "$STAGE/vendor/scrcpy-server-v4.0"
cp "$ROOT/vendor/serve-emu/LICENSE" "$STAGE/LICENSE"
cp "$ROOT/vendor/serve-emu/ATMOS-PATCHES.md" "$STAGE/ATMOS-PATCHES.md"

ARCHIVE="$OUT_DIR/$ASSET"
tar -C "$OUT_DIR" -czf "$ARCHIVE" "serve-emu-${VERSION}-darwin-arm64"
SHA256="$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')"

python3 - "$PIN" "$VERSION" "$ASSET" "$SHA256" "$STAGE/manifest.json" "$OUT_DIR/manifest.json" <<'PY'
import json, sys
pin_path, version, asset, sha256, staged, published = sys.argv[1:]
pin = json.load(open(pin_path))
manifest = {
    "name": "serve-emu",
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

echo "[pack-serve-emu] archive $ARCHIVE"

if [[ "$INSTALL" -eq 1 ]]; then
  DEST="${HOME}/.atmos/runtime/serve-emu/${VERSION}"
  mkdir -p "$(dirname "$DEST")"
  rm -rf "$DEST"
  cp -R "$STAGE" "$DEST"
  chmod +x "$DEST/serve-emu"
  echo "[pack-serve-emu] installed $DEST"
fi
