#!/usr/bin/env bash
# Optional local cargo vs blaze incremental bench for the Atmos Rust workspace.
#
# Does not change CI. Source edits are always restored. Times wall-clock of
# `cargo build -p <crate>` vs `blaze build -p <crate>` (or `cargo blaze …`)
# for a cold (empty target dir) build and an incremental rebuild after a
# one-function edit.
#
# Usage:
#   bash scripts/dev/bench-blaze.sh
#   just bench-blaze
#   PACKAGES="core-engine quota-usage" bash scripts/dev/bench-blaze.sh
#   SKIP_BLAZE=1 bash scripts/dev/bench-blaze.sh          # cargo only
#   BLAZE_SANDBOX=off bash scripts/dev/bench-blaze.sh     # container without user ns
#   RUSTUP_TOOLCHAIN=1.99.0 bash scripts/dev/bench-blaze.sh  # match ra-jit 0.0.0 on this PR's VM
#
# See docs/dev/blaze.md.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

export PATH="${HOME}/.cargo/bin:${PATH}"
export CARGO_TERM_COLOR="${CARGO_TERM_COLOR:-never}"

PACKAGES="${PACKAGES:-core-engine}"
SKIP_BLAZE="${SKIP_BLAZE:-0}"
SKIP_CLEAN="${SKIP_CLEAN:-0}"
OUT_DIR="${OUT_DIR:-${repo_root}/target/blaze-bench}"
# Default one-function edit: a tiny leaf in core-engine. Override per package
# with EDIT_FILE / EDIT_NEEDLE if you bench something else.
EDIT_FILE="${EDIT_FILE:-crates/core-engine/src/device_control/coords.rs}"
DEFAULT_EDIT_NEEDLE='pub fn validate_coord(value: f64) -> Result<f64> {'
EDIT_NEEDLE="${EDIT_NEEDLE:-$DEFAULT_EDIT_NEEDLE}"
EDIT_LINE="${EDIT_LINE:-    let _atmos_blaze_bench_touch: u8 = 1;}"

mkdir -p "$OUT_DIR"

log() { printf '%s\n' "$*" >&2; }

die() {
  log "error: $*"
  exit 1
}

have_blaze() {
  command -v blaze >/dev/null 2>&1
}

resolve_blaze() {
  BLAZE_ARGS=()
  if have_blaze; then
    BLAZE_ARGS=(blaze)
    return 0
  fi
  # Nightly installer (pre first named blaze release) ships cargo-blaze + ra-jit.
  if command -v cargo-blaze >/dev/null 2>&1; then
    BLAZE_ARGS=(cargo blaze)
    return 0
  fi
  if command -v ra-jit >/dev/null 2>&1; then
    BLAZE_ARGS=(ra-jit cargo)
    return 0
  fi
  return 1
}

maybe_disable_sandbox() {
  if [[ -n "${BLAZE_SANDBOX:-}" ]]; then
    return
  fi
  if command -v unshare >/dev/null 2>&1 && ! unshare --user true >/dev/null 2>&1; then
    export BLAZE_SANDBOX=off
    log "note: user namespaces unavailable; setting BLAZE_SANDBOX=off"
  fi
}

restore_edit() {
  if [[ -n "${EDIT_BACKUP:-}" && -f "${EDIT_BACKUP}" && -n "${EDIT_FILE:-}" ]]; then
    cp "${EDIT_BACKUP}" "${repo_root}/${EDIT_FILE}"
  fi
}

cleanup() {
  restore_edit
}
trap cleanup EXIT

require_edit_file() {
  [[ -f "${repo_root}/${EDIT_FILE}" ]] || die "edit file missing: ${EDIT_FILE}"
  grep -F -q "${EDIT_NEEDLE}" "${repo_root}/${EDIT_FILE}" \
    || die "edit needle not found in ${EDIT_FILE}"
}

apply_edit() {
  require_edit_file
  local path="${repo_root}/${EDIT_FILE}"
  EDIT_BACKUP="$(mktemp "${OUT_DIR}/edit-backup.XXXXXX")"
  cp "$path" "$EDIT_BACKUP"
  python3 - "$path" "$EDIT_NEEDLE" "$EDIT_LINE" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
needle = sys.argv[2]
line = sys.argv[3]
text = path.read_text()
if "_atmos_blaze_bench_touch" in text:
    raise SystemExit("edit already present; refusing to double-patch")
if needle not in text:
    raise SystemExit(f"needle not found: {needle!r}")
# Insert the touch as the first statement of the matched function body.
replacement = needle + "\n" + line
path.write_text(text.replace(needle, replacement, 1))
PY
}

collect_meta() {
  local os_name arch hostname commit rustc cargo_v blaze_v toolchain uname_s
  os_name="$(uname -s)"
  arch="$(uname -m)"
  hostname="$(uname -n)"
  uname_s="$(uname -a)"
  commit="$(git -C "$repo_root" rev-parse HEAD)"
  rustc="$(rustc --version 2>/dev/null || echo 'rustc: missing')"
  cargo_v="$(cargo --version 2>/dev/null || echo 'cargo: missing')"
  blaze_v="blaze: not installed"
  toolchain="n/a"
  local rustup_tc
  if [[ -n "${RUSTUP_TOOLCHAIN:-}" ]]; then
    rustup_tc="$RUSTUP_TOOLCHAIN"
  else
    rustup_tc="(unset; rust-toolchain.toml / default)"
  fi
  if have_blaze; then
    blaze_v="$(blaze --version 2>/dev/null || true)"
    if [[ -z "$blaze_v" ]]; then
      blaze_v="$(blaze -V 2>/dev/null || echo 'blaze present, version unknown')"
    fi
    toolchain="$(blaze toolchain 2>/dev/null || echo 'blaze toolchain: unknown')"
  elif command -v ra-jit >/dev/null 2>&1; then
    blaze_v="$(ra-jit --version 2>/dev/null || echo 'ra-jit present, version unknown')"
    blaze_v="${blaze_v} (no blaze binary; cargo-blaze/ra-jit from ix.dev nightly installer)"
    if command -v rustup >/dev/null 2>&1; then
      toolchain="$(rustup run nightly-2026-10-25 rustc -V 2>/dev/null || echo 'nightly-2026-10-25 not in rustup')"
    fi
  fi
  cat <<EOF
os: ${os_name}
arch: ${arch}
hostname: ${hostname}
uname: ${uname_s}
commit: ${commit}
rustc: ${rustc}
cargo: ${cargo_v}
blaze: ${blaze_v}
blaze_toolchain: ${toolchain}
rustup_toolchain: ${rustup_tc}
packages: ${PACKAGES}
edit_file: ${EDIT_FILE}
edit_line: ${EDIT_LINE}
started_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
}

# Run a command, capture combined output, print wall milliseconds on stdout.
# Exit status of the command is propagated.
run_timed() {
  local log_file="$1"
  shift
  python3 - "$log_file" "$@" <<'PY'
import subprocess
import sys
import time

log_file = sys.argv[1]
cmd = sys.argv[2:]
start = time.perf_counter()
with open(log_file, "wb") as log:
    proc = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT)
elapsed_ms = (time.perf_counter() - start) * 1000.0
print(f"{elapsed_ms:.0f}")
sys.exit(proc.returncode)
PY
}

finished_kind() {
  local log_file="$1"
  if grep -q '\[ra-jit\]' "$log_file"; then
    printf '%s\n' ra-jit
  elif grep -q 'this ra-jit compiles for' "$log_file"; then
    printf '%s\n' 'cargo-toolchain-mismatch'
  elif grep -qi 'Waiting for blaze' "$log_file"; then
    printf '%s\n' 'cargo-then-load'
  else
    printf '%s\n' cargo
  fi
}

summarize_log() {
  local log_file="$1"
  grep -E 'Finished|Waiting for blaze|ra-jit:|error:|note: blaze builds' "$log_file" \
    | tail -n 8 || true
}

run_one_package() {
  local pkg="$1"
  local tool="$2" # cargo | blaze
  local phase="$3" # cold | incremental
  local target_dir="$4"

  local stamp log_file ms rc kind
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  log_file="${OUT_DIR}/${pkg}-${tool}-${phase}-${stamp}.log"

  log ""
  log "==> ${pkg}  ${tool}  ${phase}"
  log "    CARGO_TARGET_DIR=${target_dir}"
  log "    log=${log_file}"

  set +e
  if [[ "$tool" == "cargo" ]]; then
    ms="$(
      CARGO_TARGET_DIR="$target_dir" \
        run_timed "$log_file" cargo build -p "$pkg"
    )"
    rc=$?
  else
    ms="$(
      CARGO_TARGET_DIR="$target_dir" \
        run_timed "$log_file" "${BLAZE_ARGS[@]}" build -p "$pkg"
    )"
    rc=$?
  fi
  set -e

  kind="$(finished_kind "$log_file")"
  log "    wall_ms=${ms}  rc=${rc}  finished=${kind}"
  summarize_log "$log_file" | sed 's/^/    /' >&2

  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$pkg" "$tool" "$phase" "$ms" "$rc" "$kind"
}

print_table() {
  local rows_file="$1"
  printf '\n| Crate | Tool | Phase | Wall ms | Exit | Finished |\n'
  printf '| --- | --- | --- | ---: | ---: | --- |\n'
  awk -F'\t' '{ printf "| `%s` | `%s` | %s | %s | %s | `%s` |\n", $1, $2, $3, $4, $5, $6 }' "$rows_file"
}

# --- main ---

command -v cargo >/dev/null 2>&1 || die "cargo is not on PATH"
command -v python3 >/dev/null 2>&1 || die "python3 is required for wall-clock timing"
command -v rustc >/dev/null 2>&1 || die "rustc is not on PATH"

BLAZE_ARGS=()
if [[ "$SKIP_BLAZE" != "1" ]]; then
  if resolve_blaze; then
    log "using: ${BLAZE_ARGS[*]}"
    maybe_disable_sandbox
  else
    log "blaze is not installed."
    log "install: curl -fsSL https://ix.dev/blaze | sh"
    log "continuing with cargo-only timings (SKIP_BLAZE implied)."
    SKIP_BLAZE=1
  fi
fi

meta_file="${OUT_DIR}/meta.txt"
collect_meta | tee "$meta_file"
rows_file="${OUT_DIR}/rows.tsv"
: >"$rows_file"

require_edit_file

IFS=' ' read -r -a package_list <<<"$PACKAGES"
for pkg in "${package_list[@]}"; do
  cargo_target="${repo_root}/target/blaze-bench-cargo/${pkg}"
  blaze_target="${repo_root}/target/blaze-bench-blaze/${pkg}"

  if [[ "$SKIP_CLEAN" != "1" ]]; then
    log "wiping ${cargo_target}"
    rm -rf "$cargo_target"
  fi
  mkdir -p "$cargo_target"

  run_one_package "$pkg" cargo cold "$cargo_target" | tee -a "$rows_file"
  apply_edit
  run_one_package "$pkg" cargo incremental "$cargo_target" | tee -a "$rows_file"
  restore_edit
  EDIT_BACKUP=""

  if [[ "$SKIP_BLAZE" == "1" ]]; then
    continue
  fi

  if [[ "$SKIP_CLEAN" != "1" ]]; then
    log "wiping ${blaze_target}"
    rm -rf "$blaze_target"
  fi
  mkdir -p "$blaze_target"

  run_one_package "$pkg" blaze cold "$blaze_target" | tee -a "$rows_file"
  apply_edit
  run_one_package "$pkg" blaze incremental "$blaze_target" | tee -a "$rows_file"
  restore_edit
  EDIT_BACKUP=""
done

table_file="${OUT_DIR}/table.md"
{
  echo "## Bench table"
  echo
  print_table "$rows_file"
} | tee "$table_file"

log ""
log "raw rows: ${rows_file}"
log "meta:     ${meta_file}"
log "logs:     ${OUT_DIR}/"
log "done."
