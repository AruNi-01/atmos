# Codebase Concerns

**Analysis Date:** 2025-01-30

## Tech Debt

**Incomplete Infrastructure Modules:**
- Issue: Three core infrastructure modules are stub placeholders with TODO comments
- Files:
  - `crates/infra/src/queue/mod.rs`
  - `crates/infra/src/cache/mod.rs`
  - `crates/infra/src/jobs/mod.rs`
  - `crates/infra/src/websocket/subscription.rs`
- Impact: Missing critical infrastructure for message queuing, caching, background jobs, and pub/sub subscriptions
- Fix approach: Implement these modules or remove if not needed. Queue and cache are likely needed for scaling; jobs system is needed for async tasks; subscription system needed for targeted WebSocket broadcasts

**Project Update Name/Branch Support:**
- Issue: TODO comment indicates incomplete feature implementation
- Files: `crates/core-service/src/service/ws_message.rs:416`
- Impact: Cannot update project name or sidebar_order via WebSocket API
- Fix approach: Implement `update_name()` and `update_order()` methods in `ProjectService` and wire them to `ProjectUpdate` action handler

**Error Handling with unwrap() Calls:**
- Issue: Multiple `.unwrap()` calls that could panic on error conditions
- Files:
  - `apps/api/src/api/ws/terminal_handler.rs:222,255`
  - `crates/core-engine/src/git/mod.rs:87,130,813,815,818`
  - `crates/core-service/src/service/terminal.rs:788`
- Impact: Potential runtime panics if serialization fails or paths contain invalid UTF-8
- Fix approach: Replace `.unwrap()` with proper error handling using `?` operator or `expect()` with descriptive messages

## Known Bugs

**Terminal Session Reconnection Logic:**
- Symptoms: Complex fallback logic in terminal handler may create duplicate sessions
- Files: `apps/api/src/api/ws/terminal_handler.rs:173-229`
- Trigger: When `attach` is requested but attachment fails, falls back to creating new session without clearing old state
- Workaround: None currently, may result in orphaned tmux windows
- Fix approach: Clean up failed attachment state before creating new session; ensure tmux window cleanup on errors

**SQLite Write Concurrency:**
- Symptoms: SQLite may lock under concurrent write operations
- Files: `crates/infra/src/db/connection.rs:22`
- Trigger: Multiple simultaneous workspace/project operations
- Workaround: Currently using `mode=rwc` which allows concurrent reads but writes are serialized
- Fix approach: Consider PostgreSQL for production or implement proper retry logic for write conflicts

## Security Considerations

**Permissive CORS Configuration:**
- Risk: Allows requests from any origin with any methods/headers
- Files: `apps/api/src/main.rs:83-86`
- Impact: Vulnerable to CSRF attacks if deployed publicly
- Current mitigation: None - development configuration
- Recommendations: Restrict to specific origins in production, implement CSRF tokens, validate Origin header

**No Authentication/Authorization:**
- Risk: All API and WebSocket endpoints are publicly accessible
- Files: `apps/api/src/api/workspace/handlers.rs`, `apps/api/src/api/project/handlers.rs`, `apps/api/src/api/ws/handlers.rs`
- Impact: Anyone can access, create, modify, or delete projects and workspaces
- Current mitigation: None - assumes trusted environment
- Recommendations: Implement authentication (JWT session), add user context to all operations, add authorization checks

**Command Injection via Git Operations:**
- Risk: User-supplied paths passed directly to shell commands
- Files: `crates/core-engine/src/git/mod.rs` (all `Command::new("git")` calls)
- Impact: Malicious repository paths could execute arbitrary commands
- Current mitigation: None - paths are not sanitized
- Recommendations: Validate all paths, use git library instead of shell commands, implement path allowlisting

**No Input Validation on File Operations:**
- Risk: File read/write operations accept arbitrary paths
- Files: `crates/core-engine/src/fs/mod.rs`
- Impact: Could read sensitive files or write outside intended directories
- Current mitigation: None
- Recommendations: Implement path sandboxing, validate paths are within allowed directories, disallow path traversal

**SQLite Database Permissions:**
- Risk: Database file at `~/.atmos/db/atmos.db` may have insecure permissions
- Files: `crates/infra/src/db/connection.rs:33`
- Impact: Other users on the system could read the database
- Current mitigation: None
- Recommendations: Set restrictive file permissions on database directory and file (chmod 600)

## Performance Bottlenecks

**Excessive Cloning in Terminal Service:**
- Problem: Heavy use of `.clone()` on strings and Arc types
- Files: `crates/core-service/src/service/terminal.rs:138,154,223-230,265,277-284,321,476-477,501`
- Cause: Ownership passing between async tasks and threads
- Improvement path: Use references where possible, reduce string cloning by using `Cow<str>`, consider re-architecting to share ownership via Arc more strategically

**No Connection Pooling:**
- Problem: Single database connection for all operations
- Files: `crates/infra/src/db/connection.rs:8`, `apps/api/src/main.rs:39`
- Cause: SQLite with single connection
- Improvement path: Implement connection pooling with `sqlx::SqlitePool` or migrate to PostgreSQL with proper pooling

**Synchronous Git Operations:**
- Problem: All git commands block async executor
- Files: `crates/core-engine/src/git/mod.rs` (all operations)
- Cause: Using `std::process::Command` directly
- Improvement path: Use `tokio::process::Command` or offload to blocking thread pool with `tokio::task::spawn_blocking`

**WebSocket Message Parsing:**
- Problem: Each message deserializes full JSON payload
- Files: `crates/core-service/src/service/ws_message.rs`, `apps/api/src/api/ws/handlers.rs`
- Cause: No streaming or incremental parsing
- Improvement path: Consider using more efficient serialization (MessagePack) for binary data, implement request batching

**No Caching Layer:**
- Problem: Repeated file system and git status checks
- Files: `crates/core-engine/src/fs/mod.rs`, `crates/core-engine/src/git/mod.rs`
- Cause: Cache module not implemented (see tech debt)
- Improvement path: Implement in-memory caching for file trees and git status with TTL-based invalidation

## Fragile Areas

**Terminal Service Threading Model:**
- Files: `crates/core-service/src/service/terminal.rs`
- Why fragile: Complex mix of threads, channels, async, and blocking I/O; PTY lifecycle tied to thread lifecycles
- Safe modification:
  1. Never block in PTY threads
  2. Always drain channels before dropping
  3. Use timeout for all channel operations
  4. Test session cleanup thoroughly
- Test coverage: Only basic tests present (#830-848); lacks integration tests for PTY lifecycle

**WebSocket Connection State Management:**
- Files: `apps/web/src/hooks/use-websocket.ts`, `apps/api/src/api/ws/handlers.rs`
- Why fragile: Manual reconnection logic, pending request tracking, heartbeat management
- Safe modification:
  1. Always clean up pending requests on disconnect
  2. Use exponential backoff for reconnection
  3. Test connection loss scenarios
- Test coverage: No automated tests for WebSocket reconnection scenarios

**Git Worktree Lifecycle:**
- Files: `crates/core-engine/src/git/mod.rs:41-130`
- Why fragile: Worktree creation/removal is not atomic; stale worktrees may accumulate
- Safe modification:
  1. Always clean up worktrees in tests
  2. Implement worktree orphan detection
  3. Use transactions for worktree operations
- Test coverage: No tests for worktree cleanup failure scenarios

**Database Migration Dependencies:**
- Files: `crates/infra/src/db/migration/`
- Why fragile: Migrations run on every startup; ordering dependencies implicit
- Safe modification:
  1. Always test migration rollback
  2. Never modify existing migrations
  3. Use versioned migration filenames
- Test coverage: No migration rollback tests

**Large Files with Multiple Responsibilities:**
- Files:
  - `crates/core-service/src/service/terminal.rs` (852 lines)
  - `crates/core-engine/src/git/mod.rs` (834 lines)
  - `crates/core-engine/src/tmux/mod.rs` (706 lines)
  - `crates/infra/src/websocket/message.rs` (595 lines)
  - `crates/core-service/src/service/ws_message.rs` (556 lines)
- Why fragile: Hard to test, modify, or understand
- Safe modification: Refactor incrementally, extracting smaller modules with clear interfaces
- Test coverage: Limited; mostly unit tests without comprehensive coverage

## Scaling Limits

**SQLite Concurrent Writers:**
- Current capacity: Single write operation at a time
- Limit: Database locks under concurrent writes; performance degrades with >5 simultaneous write operations
- Scaling path: Migrate to PostgreSQL or implement write-ahead log with delayed durability

**WebSocket Connection Limits:**
- Current capacity: No documented limit; default Tokio limits apply (~10k connections)
- Limit: Each terminal session spawns threads; memory usage grows linearly
- Scaling path: Implement connection pooling, limit sessions per user, use WebSocket multiplexing

**PTY Session Limits:**
- Current capacity: Limited by system PTY devices (typically ~256)
- Limit: Hard system limit on PTY devices; each terminal consumes one
- Scaling path: Implement session queuing, use pty emulation for non-interactive sessions

**File System Watchers:**
- Current capacity: Not implemented (would be needed for live file updates)
- Limit: OS limits on inotify/kqueue handles
- Scaling path: Implement recursive watching, debounce events, use polling fallback

## Dependencies at Risk

**React 19.2.3:**
- Risk: Early React 19 release, may have breaking changes in future versions
- Impact: `apps/web/src/lib/suppress-react19-ref-warning.ts` exists to suppress warnings
- Migration plan: Monitor React 19 stable releases, remove suppression shim when ecosystem catches up

**Next.js 16.1.2:**
- Risk: Early Next.js 16 release, rapid changes expected
- Impact: May require updates to app router patterns and server components
- Migration plan: Pin to specific minor version, follow Next.js upgrade guide for each bump

**Monaco Editor:**
- Risk: Large bundle size (~5MB), affects page load
- Impact: Slow initial load for editor component
- Migration plan: Implement code splitting, lazy load Monaco, consider lighter alternatives for simple editing

**xterm.js:**
- Risk: Heavy dependency, multiple addons
- Impact: Terminal initialization adds ~1MB to bundle
- Migration plan: Already using lazy loading via addons, consider web worker for terminal rendering

**Sea-ORM + SQLite:**
- Risk: Sea-ORM may have issues with SQLite concurrency
- Impact: Write locks under concurrent operations
- Migration plan: Test with sqlx for direct SQLite access, or migrate to PostgreSQL

## Missing Critical Features

**No Rate Limiting:**
- Problem: API and WebSocket endpoints have no rate limits
- Blocks: Protection against abuse, resource exhaustion
- Files: `apps/api/src/main.rs`, `apps/api/src/api/ws/handlers.rs`

**No Logging/Monitoring:**
- Problem: Only console logging; no structured logs, metrics, or tracing export
- Blocks: Production debugging, performance monitoring, alerting
- Files: All modules use `tracing::debug/info/warn/error` but no collector configured

**No Request Validation:**
- Problem: WebSocket requests use loose `Value` types without schema validation
- Blocks: Type safety, early error detection, API documentation
- Files: `crates/core-service/src/service/ws_message.rs:50-135`

**No Session Management:**
- Problem: WebSocket connections use client-supplied session IDs
- Blocks: Multi-user support, session hijacking prevention, proper authentication
- Files: `apps/api/src/api/ws/terminal_handler.rs:73-116`

**No File Change Notifications:**
- Problem: No mechanism to notify clients of file changes
- Blocks: Real-time collaboration, auto-refresh on external changes
- Files: Would require file system watcher in `crates/core-engine/src/fs/mod.rs`

**No Audit Trail:**
- Problem: No logging of who changed what and when
- Blocks: Compliance, debugging, rollback capabilities
- Files: Database entities lack audit fields (created_by, updated_by)

## Test Coverage Gaps

**WebSocket Integration Tests:**
- What's not tested: Full request/response cycle, reconnection scenarios, heartbeat
- Files: `apps/api/src/api/ws/handlers.rs`, `apps/web/src/hooks/use-websocket.ts`
- Risk: Reconnection bugs may occur in production
- Priority: High

**Terminal Session Lifecycle:**
- What's not tested: Session cleanup on error, orphaned PTY detection, tmux state recovery
- Files: `crates/core-service/src/service/terminal.rs`
- Risk: Resource leaks, orphaned processes
- Priority: High

**Git Operation Edge Cases:**
- What's not tested: Merge conflicts, detached HEAD, corrupted repositories, network failures
- Files: `crates/core-engine/src/git/mod.rs`
- Risk: Unhandled git states, data loss
- Priority: Medium

**Error Recovery Paths:**
- What's not tested: Database connection failures, WebSocket timeouts, command execution failures
- Files: All service modules
- Risk: Cascading failures, poor error messages
- Priority: Medium

**Concurrent Access:**
- What's not tested: Multiple users modifying same project/workspace simultaneously
- Files: `crates/core-service/src/service/project.rs`, `crates/core-service/src/service/workspace.rs`
- Risk: Race conditions, last-write-wins conflicts
- Priority: Medium

**Database Migration Rollbacks:**
- What's not tested: Migrating down, schema conflicts, data loss scenarios
- Files: `crates/infra/src/db/migration/`
- Risk: Cannot rollback safely, migration failures
- Priority: Low

**Frontend State Synchronization:**
- What's not tested: Zustand store consistency across components, WebSocket message ordering
- Files: `apps/web/src/hooks/use-*.ts`
- Risk: UI inconsistencies, stale data display
- Priority: Medium

---

*Concerns audit: 2025-01-30*
