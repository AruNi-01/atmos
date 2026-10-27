# Optional Blaze incremental Rust builds

> **When to load**: When considering [Blaze](https://github.com/indexable-inc/blaze) as a
> local `cargo` stand-in for Atmos Rust iteration, or when reproducing the
> cargo-vs-blaze bench.

**Status:** optional local experiment only. Cargo + the repo pin in
[`rust-toolchain.toml`](../../rust-toolchain.toml) + CI remain the source of
truth. This document does **not** recommend Blaze as the default local toolchain
and **must not** be read as permission to switch default CI or release builds
onto Blaze.

Upstream docs checked against [indexable-inc/blaze](https://github.com/indexable-inc/blaze)
README / `docs/install.md` / `docs/usage.md` / `docs/toolchain.md` /
`docs/support.md` / `docs/ci-runner.md` (fetched 2026-10-27).

---

## What Blaze is

Blaze is a young incremental Rust compiler that sits beside Cargo. Commands
match Cargo:

```sh
curl -fsSL https://ix.dev/blaze | sh   # install (~/.cargo/bin)

blaze build
blaze test
blaze run
```

`cargo blaze …` is the same as `blaze …` when Cargo is installed.

The **first** build of a project still runs Cargo, then a daemon loads the
workspace (seconds, not milliseconds). After that, editing a function and
building again is supposed to splice only the changed functions. The `Finished`
line says `[ra-jit]` when Blaze’s engine did the work (Blaze was named ra-jit
until 2026-10-24).

When Blaze is not sure its result would match Cargo (lockfile / manifest /
build-script input change, adding/removing a `#[test]`, several flags), it
falls back to Cargo and prints a reason.

---

## Atmos workspace this would even apply to

Cargo workspace members today (`Cargo.toml`):

| Member                   | Role                                                                         | Blaze-relevant?                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`               | Atmos Server (`api` bin)                                                     | Yes, for local `dev` profile iteration on Linux / macOS arm64                                                                                                                                                                         |
| `apps/cli`               | `atmos` CLI bin                                                              | Same as API                                                                                                                                                                                                                           |
| `apps/desktop/src-tauri` | **Deprecated** Tauri crate `atmos-desktop` (`staticlib` + `cdylib` + `rlib`) | **No for `cargo blaze`**: Blaze serves programs; a build that would write a `cdylib` / `staticlib` errors. CI already `--exclude atmos-desktop`. Production desktop is Electron (`apps/desktop-electron`), which is not a Cargo crate |
| `crates/*`               | `infra` → `core-engine` → `core-service` plus capability crates              | Yes for local `dev` / `test` on supported OS/arch                                                                                                                                                                                     |

Day-to-day crates developers actually rebuild: `core-engine`, `core-service`,
`infra`, `agent`, and the `api` binary. The reproducible bench below times
`core-engine` only (small enough for an agent VM; still a crate people edit).

---

## Coverage matrix (honest)

| Surface                                                                                                             | Can Blaze cover it?                                            | Why                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local `cargo build -p core-engine` (and similar lib crates) on **Linux x86-64 / Linux ARM64 / macOS Apple silicon** | **Maybe**, as an optional accelerator after the daemon is warm | These are the platforms with measured speedups. Incremental function edits are the whole point                                                                                                                                                                                                                                       |
| Local `cargo run --bin api` / `just dev-api` loop                                                                   | **Maybe** the compile step, not the process lifetime           | `blaze run` exists. Live-reload of a _running_ program (`ra-jit-live`) is macOS Apple silicon in the current release; Linux live edits are “on main / next release” per upstream. Atmos API is a long-running server — live splice is unproven here and not recommended                                                              |
| **Windows**                                                                                                         | **No useful speedup**                                          | README: every Windows build falls back to Cargo. `docs/support.md`: `cargo blaze` hands PE/COFF to Cargo (`unsupported_target`). Intel Macs are unsupported. Do not tell Windows Atmos developers to install Blaze for faster builds                                                                                                 |
| **Default CI** (`.github/workflows/ci-backend.yml`, e2e, release)                                                   | **Do not use**                                                 | CI installs `dtolnay/rust-toolchain@stable`, then `cargo fmt` / `clippy` / `test` / `build --release --bin api`. Blaze’s own CI runner is **design only** (`docs/ci-runner.md`: “Status: design, nothing built”). Changing default CI is out of scope and would mix a different compiler into the merge gate                         |
| **Toolchain pin** (`rust-toolchain.toml` `channel = "stable"`)                                                      | **Mismatch, by design**                                        | Docs say Blaze uses `blaze-2026-10-25` / `nightly-2026-10-25` (`rustc 1.101.0-nightly`) whatever the repo pins. The ix.dev nightly we installed was `ra-jit 0.0.0` which **requires `rustc 1.99.0`** and otherwise **falls back to Cargo**. Atmos CI stays on **stable**. A green Blaze/`[ra-jit]` build is not a green stable build |
| **Release / `--release` / `just build-api` / `just build-cli`**                                                     | **Do not use for truth**                                       | `cargo blaze` serves **dev and test** profiles and **hands `--release` to Cargo**. Blaze also does not inline across functions, so even a “release-shaped” daemon build is not comparable to `rustc` `-O`. Ship artifacts must stay `cargo build --release` on stable                                                                |
| **Tauri / deprecated desktop**                                                                                      | **Do not bother**                                              | `atmos-desktop` is `cdylib`/`staticlib`; production shell is Electron. Sidecar `api` / `atmos` bins are still Cargo release builds in the release workflows                                                                                                                                                                          |
| **Clippy / rustfmt**                                                                                                | **No**                                                         | Pass through to Cargo at best. Format and lint gates stay `cargo fmt` / `cargo clippy` on stable                                                                                                                                                                                                                                     |
| **Memory**                                                                                                          | Real cost                                                      | Daemon holds a few GB for a small project and tens of GB for large ones. Trades RAM for incremental speed. Tight VMs may OOM or fall back                                                                                                                                                                                            |
| **Correctness / youth**                                                                                             | Cargo/CI remain the gate                                       | Borrow checker is new: 0.1.x missed a large fraction of rustc’s borrow errors (upstream: about two thirds found on `main`). Type errors fail; some borrow errors can still build and run. Upstream’s own advice: keep `cargo check` or CI as the final word                                                                          |
| **Alpine / musl / old glibc**                                                                                       | Unsupported                                                    | Linux needs glibc 2.34+. Containers need user namespaces or `BLAZE_SANDBOX=off`                                                                                                                                                                                                                                                      |
| **`cargo blaze enable` (make plain `cargo build` call Blaze)**                                                      | **Do not enable for Atmos**                                    | Global `~/.cargo/config.toml` rewrite. Upstream notes edits can be _slower_ than plain Cargo this way. Would silently desync local `cargo` from CI stable                                                                                                                                                                            |

---

## Recommendation

**Optional only. Not the default local recommendation.**

On this Linux VM, Blaze did **not** accelerate Atmos as installed: `ra-jit 0.0.0`
refused `rustc 1.97.1` (the repo pin) and fell back to Cargo, so incremental was
1.43 s vs Cargo 1.29 s. After forcing `RUSTUP_TOOLCHAIN=1.99.0` to match that
binary, a one-function `core-engine` rebuild was **18 ms `[ra-jit]` vs 1.31 s
Cargo** (~73×). That speedup is real and also **the reason it cannot be the
default**: it requires leaving Atmos stable, it is a different compiler than CI,
Windows still falls back, RAM cost is real, and the tool is a 0.0.0 nightly.

Use Cargo on the repo’s **stable** pin for everyday Atmos Rust, and always for
CI, clippy, tests you trust, and anything you ship.

Try Blaze only if you are on macOS Apple silicon or Linux, can install the
**exact** rustc that `ra-jit status` names (here `1.99.0`), have RAM to spare,
and want a faster _function-edit_ loop on a lib crate or the `api`/`atmos` bins
in the **dev** profile. Treat every surprising compile or runtime difference as
a Blaze bug, not as “Atmos is wrong.” Re-run with `cargo` before you commit.

Do **not**:

- Switch default CI workflows to Blaze
- Use Blaze output as release truth
- `cargo blaze enable` in this repo’s developer instructions
- Expect a Windows or Tauri win

---

## Install (local, optional)

```sh
curl -fsSL https://ix.dev/blaze | sh
# puts blaze / cargo-blaze on ~/.cargo/bin (or $CARGO_HOME/bin) — do not commit the binary

cd /path/to/atmos
blaze build -p core-engine          # or: cargo blaze build -p core-engine
# first time: Cargo, then "Waiting for blaze to load the workspace"
# after a function edit: Finished … [ra-jit]
```

Until the first named `blaze` release, the Linux installer may only drop `cargo-blaze`
(a shim) plus `ra-jit` / `cargo-ra-jit`. `cargo blaze build` still works; `blaze` as a
binary may be missing. `ra-jit --version` on the Cloud Agent run of this PR reported
`ra-jit 0.0.0`.

Other install paths (crates.io, Nix) are in upstream `docs/install.md`. Atmos
does not vendor Blaze and does not pin a Blaze version in CI.

In a container without user namespaces:

```sh
export BLAZE_SANDBOX=off
```

The bench script sets that automatically when `unshare --user` fails.

---

## Reproducible bench

Script: [`scripts/dev/bench-blaze.sh`](../../scripts/dev/bench-blaze.sh)

```sh
just bench-blaze
# or: bash scripts/dev/bench-blaze.sh
```

What it does:

1. Records OS / `uname -m` / commit SHA / `rustc` / `cargo` / `blaze` version
   (and `blaze toolchain` if installed).
2. Uses **separate** `CARGO_TARGET_DIR` trees so stable Cargo and Blaze’s
   nightly do not clobber each other:
   `target/blaze-bench-cargo/<crate>` vs `target/blaze-bench-blaze/<crate>`.
3. **Cold**: wipe that target dir, then `cargo build -p <crate>` and
   `blaze build -p <crate>`.
4. **Incremental**: insert one statement at the start of
   `core-engine`’s `validate_coord` in
   `crates/core-engine/src/device_control/coords.rs`
   (`let _atmos_blaze_bench_touch: u8 = 1;`), rebuild, restore the file
   (also restored on `EXIT`).
5. Parses the log for `[ra-jit]` vs a Cargo-looking `Finished` line.
6. Prints a markdown table. Logs land under `target/blaze-bench/` (gitignored).

Default crate: `core-engine`. Override with `PACKAGES="core-engine quota-usage"`.
Cargo-only: `SKIP_BLAZE=1`. Skip wiping target dirs: `SKIP_CLEAN=1`.

Desktop / Tauri is **not** on the timed path (too heavy, and `atmos-desktop`
is the wrong crate type).

### Method (this PR’s Linux VM run)

| Item              | Value                                                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host              | Cursor Cloud Agent VM, Linux `x86_64`, 4 CPUs, ~16 GiB RAM, glibc 2.39                                                                                                           |
| Install           | `curl -fsSL https://ix.dev/blaze \| sh` succeeded (13 s). Dropped `cargo-blaze` + `ra-jit 0.0.0` into `$CARGO_HOME/bin`; **no** `blaze` binary. Also rustup `nightly-2026-10-25` |
| Command           | `bash scripts/dev/bench-blaze.sh`, then a second pass with `RUSTUP_TOOLCHAIN=1.99.0`                                                                                             |
| Crate             | `core-engine`                                                                                                                                                                    |
| One-function edit | first statement inside `validate_coord` (`let _atmos_blaze_bench_touch: u8 = 1;`); restored after each incremental pair                                                          |
| Timing            | Python `time.perf_counter()` around the full `cargo`/`blaze` process (wall clock)                                                                                                |
| Cold              | empty per-tool `CARGO_TARGET_DIR` (crates.io downloads already cached)                                                                                                           |
| Incremental       | same target dir, immediately after a successful cold build of that tool                                                                                                          |
| Commit            | `fe29dc6b95b848f35220b7f41b060b8ab860b0fd` (docs commit on this branch)                                                                                                          |

### Results — Atmos default pin (`rust-toolchain.toml` stable = `rustc 1.97.1`)

Installer claimed Blaze’s own `nightly-2026-10-25`, but this `ra-jit 0.0.0` binary **compiles for `rustc 1.99.0 (b940084d7 2026-09-28)`**. On the repo pin it printed:

`ra-jit: rustc 1.97.1 is not the 1.99.0 this ra-jit compiles for; building with cargo`

Every Blaze build was Cargo. Incremental was slightly **slower** than plain Cargo.

| Crate         | Tool    | Phase       | Wall ms | Exit | Finished |
| ------------- | ------- | ----------- | ------: | ---: | -------- |
| `core-engine` | `cargo` | cold        |   22442 |    0 | `cargo`  |
| `core-engine` | `cargo` | incremental |    1287 |    0 | `cargo`  |
| `core-engine` | `blaze` | cold        |   21645 |    0 | `cargo`  |
| `core-engine` | `blaze` | incremental |    1433 |    0 | `cargo`  |

`ra-jit status`: `every build is cargo's: rustc 1.97.1 is not the 1.99.0 this ra-jit compiles for`

### Results — matched toolchain (`RUSTUP_TOOLCHAIN=1.99.0`)

`rustup toolchain install 1.99.0 --profile minimal --component rust-src` → `rustc 1.99.0 (b940084d7 2026-09-28)`, the exact `-V` line this ra-jit wants. Cold Blaze still ran Cargo (first load). Incremental then showed `[ra-jit]`. A repeat one-line edit was also **18 ms** / `[ra-jit]`.

| Crate         | Tool    | Phase       | Wall ms | Exit | Finished     |
| ------------- | ------- | ----------- | ------: | ---: | ------------ |
| `core-engine` | `cargo` | cold        |   21506 |    0 | `cargo`      |
| `core-engine` | `cargo` | incremental |    1310 |    0 | `cargo`      |
| `core-engine` | `blaze` | cold        |   21439 |    0 | `cargo`      |
| `core-engine` | `blaze` | incremental |  **18** |    0 | **`ra-jit`** |

Incremental speedup when the toolchain matches: **1310 / 18 ≈ 73×** vs Cargo on this crate and machine (n=2 for 18 ms). Cold is a tie. This **overrides** Atmos stable and is **not** what CI runs.

Copy `target/blaze-bench/meta.txt` and the printed table into this section when
you re-run on a laptop.

---

## Related

- [`rust-toolchain.toml`](../../rust-toolchain.toml) — Atmos pin (`stable`)
- [`.github/workflows/ci-backend.yml`](../../.github/workflows/ci-backend.yml) — fmt / clippy / test / release `api` via Cargo
- [`agents/references/dev-environment.md`](../../agents/references/dev-environment.md) — toolchain sources of truth
- Upstream: [github.com/indexable-inc/blaze](https://github.com/indexable-inc/blaze)
