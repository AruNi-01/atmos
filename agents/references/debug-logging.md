# Debug Logging Reference

The project ships a lightweight, structured debug logging infrastructure that writes JSON-line logs to `./logs/debug/`. Use it whenever you need to instrument a lifecycle flow or diagnose a tricky bug.

---

## Backend (Rust)

**File**: `crates/infra/src/utils/debug_logging.rs`
**Crate dependency**: `infra`

### Basic usage

```rust
use infra::utils::debug_logging::DebugLogger;

// Conventional module-level helper — declare once at the top of the module
fn dbg() -> DebugLogger {
    DebugLogger::new("my-prefix")  // → ./logs/debug/my-prefix-YYYY-MM-DD.log
}

// Log with structured data
dbg().log("WS_CONNECT", "WebSocket connected", Some(serde_json::json!({
    "session_id": session_id,
    "workspace_id": workspace_id,
})));

// Log without extra data
dbg().log("CLEANUP_DONE", "cleanup complete", None);
```

### Convenience helpers

```rust
use infra::utils::debug_logging::{count_pty_devices, count_atmos_client_sessions};

let pty_before = count_pty_devices();                       // Option<usize> — /dev/ttys* (macOS) / /dev/pts/* (Linux)
let sessions   = count_atmos_client_sessions(&socket_path); // Option<usize> — counts atmos_client_* tmux sessions
```

### Conventions

- Declare `fn dbg() -> DebugLogger` once per module (not as a `static` — it's a tiny cheap struct).
- Category names: `SCREAMING_SNAKE_CASE`, e.g. `"WS_CONNECT"`, `"CLOSE_SESSION_START"`.
- Measure before **and** after the operation to capture deltas: `let before = count_pty_devices(); /* op */ let after = count_pty_devices();`

---

## Frontend (TypeScript)

**File**: `packages/shared/src/utils/debug-logger.ts`
**Import**: `import { getDebugLogger } from "@atmos/shared/utils/debug-logger";`

### Basic usage

```ts
// Module-level singleton — call once, reuse everywhere in the module
const dlog = getDebugLogger("terminal", "http://localhost:30303");

dlog.log("WS_CONNECTING", "Opening WebSocket", { url, sessionId });
dlog.log("WS_OPEN", "Connected");   // data is optional
```

### Deriving the API base URL from a WebSocket URL at runtime

```ts
const debugApiBase = wsUrl
  .replace(/^ws:/, "http:")
  .replace(/^wss:/, "https:")
  .replace(/\/ws.*$/, "");
```

### Passing via component props (when the API base isn't a module-level constant)

```ts
// In the hook options interface
debugApiBase?: string;

// In the hook body
const dlog = debugApiBase ? getDebugLogger("terminal", debugApiBase) : null;
dlog?.log("WS_OPEN", "Connected", { sessionId });
```

### Behaviour

- Entries are batched and POSTed to `POST /api/system/debug-log` every 200 ms.
- `keepalive: true` is set so in-flight logs survive page unload.
- All network errors are silently swallowed — the logger never crashes the app.
- Each entry is also printed to `console.debug` for convenience during active debugging.

---

## Where logs appear

| Source | File path |
|--------|-----------|
| Backend | `./logs/debug/<prefix>-YYYY-MM-DD.log` |
| Frontend | `./logs/debug/frontend-<prefix>-YYYY-MM-DD.log` |

Tail a live log:

```bash
tail -f ./logs/debug/terminal-$(date +%Y-%m-%d).log | jq .
```

---

## Cleanup after debugging

Once the bug is fixed, **remove the call sites** from production code.
**Keep the infrastructure** — the utilities and the `/api/system/debug-log` endpoint are permanent and reusable.

Files to keep:
- `crates/infra/src/utils/debug_logging.rs`
- `packages/shared/src/utils/debug-logger.ts`
- `apps/api/src/api/system/handlers.rs` → `ingest_frontend_debug_log` handler
- `apps/api/src/api/system/mod.rs` → `/debug-log` route
