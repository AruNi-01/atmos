# Dev & Cloud Environment

> **When to load**: When setting up or reproducing the Atmos dev environment on a
> new machine, in CI, or on a Cloud Agent; when editing the Nix flake / dev
> scripts; or when configuring a Cloud Agent / CI install & start step.

Atmos is a Rust (Axum **Atmos Server**) + Next.js (bun workspaces) monorepo. The
same setup works locally, in CI, and on ephemeral Cloud Agents.

---

## Toolchains (single sources of truth)

| Tool | Pin / source | Notes |
|------|--------------|-------|
| Rust | `rust-toolchain.toml` (`channel = "stable"`) | Auto-selected by `rustup` and by Nix (`rust-overlay`). Must be ≥ 1.85 for `edition2024` deps. Matches CI (`dtolnay/rust-toolchain@stable`). |
| bun | `package.json` → `packageManager` (`bun@1.3.x`) | JS/TS package manager for all workspaces. |
| node | v22 | Used by `scripts/*` node tooling. |
| just, zsh | task runner + shell the `justfile` requires (`set shell := ["zsh", ...]`) | |
| tmux, git, gh | terminal PTY sessions, VCS, agent-hook/review flows | |

Native build deps for the Rust workspace: `pkg-config`, `openssl`, `perl`, `cmake`.

Runtime data (SQLite DB, skills, manifest) lives under `~/.atmos` — self-contained,
no external database required. See
[runtime/atmos-home-layout.md](runtime/atmos-home-layout.md).

---

## Ways to get a working shell

1. **Host toolchains** — install bun + a modern Rust (`rustup`), then
   `bun install` and `cargo build --bin api`.
2. **Nix dev shell (reproducible)** — `nix develop` builds the exact toolchain
   from `flake.nix` (`rust-toolchain.toml` drives the Rust version). Requires
   flakes enabled.
3. **direnv** — `.envrc` runs `use flake`, so the Nix shell loads automatically
   on `cd` (run `direnv allow` once; `nix-direnv` recommended for caching).

### One-command bootstrap (recommended for any environment)

```bash
bash scripts/dev/setup.sh   # install: prefers Nix dev shell, else host bun + cargo
bash scripts/dev/start.sh   # run: API (:30303, background) + web (:3030, foreground)
```

- Both scripts auto-detect Nix (`flake.nix` present + `nix` on PATH) and fall
  back to host toolchains otherwise. Force the host path with `ATMOS_SKIP_NIX=1`.
- `start.sh` runs `just dev-api` in the background and `just dev-web` in the
  foreground so the process stays attached (suitable for a Cloud Agent / CI
  "start" step). The supervising shell tears down the API when web exits.

### Manual dev (equivalent)

```bash
bun install
just dev-api   # or: cargo run --bin api -- --cleanup-stale-clients true
just dev-web   # Next.js on :3030 → API :30303 (NEXT_PUBLIC_API_PORT)
```

---

## Installing Nix (when a host doesn't have it)

Nix installs on any Linux/macOS host. On a container/VM **without systemd**, use
the Determinate installer with `--init none` and start the daemon manually, or do
a single-user install:

```bash
# no-systemd container (multi-user), then start the daemon yourself:
curl -fsSL https://install.determinate.systems/nix | sh -s -- install linux --init none --no-confirm
sudo determinate-nixd daemon &        # or: sudo nix-daemon &

# alternative: single-user install (no daemon needed)
sh <(curl -L https://nixos.org/nix/install) --no-daemon
```

Requirements: `curl`/`xz`, and (for the build sandbox) user namespaces — if a
locked-down container disables them, use the single-user install or
`--extra-conf "sandbox = false"`. Flakes must be enabled
(`experimental-features = nix-command flakes`; the Determinate installer enables
them by default).

> Nix reproduces the **toolchain**, not compiled first-party artifacts. The
> initial `cargo build` still compiles the workspace unless the platform snapshots
> the build or you wire up a binary cache (e.g. Cachix).

---

## Cloud Agent / CI wiring

Point the environment's **install** and **start** steps at the scripts:

```text
install: bash scripts/dev/setup.sh
start:   bash scripts/dev/start.sh
```

Cursor Cloud specifics:

- Each agent boots from a base image/snapshot, then Cursor does a **fresh git
  checkout** and runs `install`. Keep `install` idempotent (it can run again on
  new branches) and let it terminate — no long-running servers in `install`.
- Dev servers belong in `start` (or `terminals`), not `install`.
- The base snapshot should carry the slow, stable toolchains (bun, Rust, just,
  zsh); `install` only refreshes source-derived state (`bun install`,
  `cargo build`).

---

## Setting up a NEW environment (checklist)

1. Base image provides stable toolchains: bun, Rust (or Nix), `just`, `zsh`,
   `tmux`, `git`, `gh`.
2. `install` = `bash scripts/dev/setup.sh` — runs to completion and is
   idempotent (run it twice to confirm).
3. `start` = `bash scripts/dev/start.sh` — brings up API + web and stays
   attached.
4. Verify end-to-end:
   - `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:30303/healthz` → `200`
   - `curl -s -L http://localhost:3030/ | grep -i '<title>'` → `Welcome – ATMOS`
   - API log shows `ATMOS_READY port=30303`.

---

## Related

- [../../packages/config/AGENTS.md](../../packages/config/AGENTS.md) — TypeScript (TS 6 API + TS 7 `tsc`)
- [runtime/AGENTS.md](runtime/AGENTS.md) — local runtime, manifest, relay identity
- [mobile/dev-setup.md](mobile/dev-setup.md) — Expo mobile native dev environment
