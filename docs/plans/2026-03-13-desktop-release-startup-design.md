# Desktop Release Startup Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make desktop release startup deterministic by consolidating agent chat migrations, bundling system skills, and separating critical startup failures from non-critical initialization.

**Architecture:** The release build will bundle a `system-skills` resource tree and pass its resolved path to the API sidecar via environment variables. The API startup path will only block on database open, migrations, and socket bind; skill sync and ACP registry refresh will run as background non-critical tasks. Desktop startup will capture sidecar stdout/stderr into the standard Tauri app log directory and surface the latest diagnostics in the startup dialog.

**Tech Stack:** Rust, SeaORM migrations, Tauri 2, Node prebuild script

---

### Task 1: Consolidate agent chat migration history

**Files:**
- Modify: `crates/infra/src/db/migration/m20260215_000007_create_agent_chat_tables.rs`
- Modify: `crates/infra/src/db/migration/m20260225_000009_add_mode_to_agent_chat_session.rs`

**Step 1: Update the base table migration**

Add the final `mode` column and the final context index directly in `000007` so fresh installs get the final schema in one pass.

**Step 2: Preserve migration ordering without schema churn**

Convert `000009` into a documented no-op, matching the existing `000008` preservation approach.

**Step 3: Verify migration references**

Run a focused search for `idx-agent_chat_session-context` and migration references to ensure no stale assumptions remain.

### Task 2: Make release skill sync resource-based

**Files:**
- Modify: `crates/infra/src/utils/system_skill_sync.rs`
- Modify: `scripts/desktop/before-build.mjs`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`

**Step 1: Add bundled resource preparation**

Copy the repo `skills/` tree into `apps/desktop/src-tauri/binaries/system-skills` during desktop prebuild and bundle it as a Tauri resource.

**Step 2: Refactor runtime skill resolution**

Teach `system_skill_sync` to prefer `ATMOS_SYSTEM_SKILLS_DIR` when present, fall back to source-root resolution only for development mode, and remove the GitHub clone fallback entirely.

**Step 3: Keep missing resources non-fatal**

Warn and skip when bundled or source skills are unavailable instead of failing startup.

### Task 3: Tighten startup critical-path boundaries

**Files:**
- Modify: `apps/api/src/main.rs`

**Step 1: Separate critical startup from background startup**

Keep DB connect, migration, router construction, and listener bind on the blocking path. Move skill sync and ACP registry refresh into a dedicated non-critical startup task launched only after the listener is ready.

**Step 2: Preserve existing ready contract**

Continue emitting `ATMOS_READY port=<port>` only after the listener is bound.

### Task 4: Improve desktop diagnostics

**Files:**
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Create: `apps/desktop/src-tauri/src/logging.rs`

**Step 1: Centralize app log path resolution**

Use Tauri's `app_log_dir()` for desktop logs and share that logic between startup logging and debug-log IPC.

**Step 2: Capture startup stderr/stdout**

Buffer recent sidecar output during startup, log everything to disk, and include the latest stderr/stdout excerpt in startup failures instead of only reporting `TerminatedPayload`.

**Step 3: Pass bundled skill resource path to the sidecar**

When the desktop bundle contains `system-skills`, pass it through `ATMOS_SYSTEM_SKILLS_DIR`.

### Task 5: Verify the release-mode path

**Files:**
- No code changes expected

**Step 1: Format touched Rust files**

Run `cargo fmt` scoped to the workspace if needed.

**Step 2: Run focused checks**

Run `cargo check -p infra -p api -p atmos-desktop` and verify the Node prebuild script still succeeds structurally.

**Step 3: Summarize residual risk**

Call out that existing local databases may retain the older extra index, while fresh installs now get the clean schema path.
