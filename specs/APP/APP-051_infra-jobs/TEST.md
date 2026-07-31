# TEST · APP-051: Infra Jobs & Queue (Local-First)

> Test Plan · verify local `jobs` / `queue` ports, migrations, and entry-style rules (jobs vs queue vs direct). References PRD APP-051 and TECH APP-051.

## Test strategy

Backend infrastructure. Proof is **Rust unit tests** in `infra` plus **service-level** parity tests. No new user UI; no Playwright required. No agent-browser checks.

- **Unit (`infra`)**: LocalScheduler + LocalMemoryQueue behavior.
- **Service**: automation tick wiring, AI usage attach/replace, agent-hooks job, github queue consumer (mocked domain).
- **Static / review**: inventory, no dual loops, manual path free of ports.
- **Manual (optional)**: local smoke of schedule + refresh + webhook enqueue.

## Coverage map

| PRD item | Scenario IDs |
|----------|--------------|
| M1 Jobs port | S1, S2 |
| M2 Queue port | S10, S11 |
| M3 Local jobs | S1–S7 |
| M4 Local queue | S10–S13 |
| M5 Lifecycle | S7, S13 |
| M6 Automation tick | S14, S15, S16 |
| M7 Manual direct | S17 |
| M8 Events via queue | S18, S19 |
| M9 AI usage | S20, S21, S22 |
| M10 Agent-hooks cleanup | S23 |
| M11 Layering | S24 |
| M12 Inventory | S25 |
| N1–N5 | deferred |

## Execution map

| Scenario | Level | Expected tool | Target command / method | Fixture / data | Signals | Status |
|----------|-------|---------------|-------------------------|----------------|---------|--------|
| S1 | Rust unit | `cargo test -p infra` | interval fires | short interval | counter ≥ 2 | planned |
| S2 | Rust unit / API | `cargo test -p infra` | public surface | exports | no apalis/mq deps in infra for v1 | planned |
| S3 | Rust unit | `cargo test -p infra` | cancel | running job | counter stops | planned |
| S4 | Rust unit | `cargo test -p infra` | replace same id | two specs | single active cadence | planned |
| S5 | Rust unit | `cargo test -p infra` | skip_if_running | long handler | no overlap starts | planned |
| S6 | Rust unit | `cargo test -p infra` | fire_immediately true/false | both specs | true runs soon; false waits | planned |
| S7 | Rust unit | `cargo test -p infra` | jobs shutdown | running job | clean stop | planned |
| S10 | Rust unit | `cargo test -p infra` | enqueue + consume | capacity 8 | handler sees payload | planned |
| S11 | Rust unit | `cargo test -p infra` | queue full | fill capacity | `EnqueueError::Full` | planned |
| S12 | Rust unit | `cargo test -p infra` | FIFO best-effort | ordered msgs | order preserved with 1 consumer | planned |
| S13 | Rust unit | `cargo test -p infra` | queue shutdown | active consumer | clean stop | planned |
| S14 | Service | `cargo test -p core-service` | due tick via jobs wiring | due automation | run / next_run advanced | planned |
| S15 | Service | `cargo test -p core-service` | pause / already_running | fixtures | domain rules hold | planned |
| S16 | Service / static | `cargo test` + `rg` | no raw interval in scheduler_service | source | jobs registration only | planned |
| S17 | Service / static | `rg` + existing tests | manual run path | start_run API | no enqueue/set_interval in path | planned |
| S18 | Service / API | `cargo test` | enqueue on github ingress | mock queue | message enqueued | planned |
| S19 | Service | `cargo test` | consumer → domain | payload fixture | claim/start path invoked | planned |
| S20 | Service | `cargo test -p quota-usage` | attach_jobs enables refresh | short interval / mock | refresh runs | planned |
| S21 | Service | `cargo test -p quota-usage` | change interval | replace | one registration | planned |
| S22 | Service | `cargo test -p quota-usage` | disable | cancel | no further refresh | planned |
| S23 | Unit / integration | `cargo test` or api test | hooks cleanup job | jobs registry | id registered; no main.rs raw loop | planned |
| S24 | Static | `rg` | jobs/queue modules | infra | no domain imports | planned |
| S25 | Static | `rg` / review | inventory | relay/pty/manual | non-migrate list respected | planned |

## Scenarios

### S1 — Interval job fires

- **Level**: Unit (`infra`)
- **Given**: `LocalScheduler`, job every ~50–100ms, atomic counter handler, `fire_immediately: true`.
- **When**: wait ≥ 2 periods.
- **Then**: counter ≥ 2.
- **Signals**: counter; test completes.

### S2 — No distributed job/MQ dependency in v1

- **Level**: Unit / crate deps
- **Given**: `crates/infra/Cargo.toml` after implementation.
- **When**: inspected.
- **Then**: no apalis / lapin / redis-streams / nats required for default features.
- **Signals**: Cargo.toml; build graph.

### S3 — Cancel stops future ticks

- **Level**: Unit
- **Given**: running interval job.
- **When**: `cancel(id)`.
- **Then**: counter stable across former periods.
- **Signals**: counter.

### S4 — Replace-by-id

- **Level**: Unit
- **Given**: job `demo` registered.
- **When**: `set_interval_job` again with same id and different generation marker.
- **Then**: only new handler generation runs.
- **Signals**: generation atomic.

### S5 — skip_if_running

- **Level**: Unit
- **Given**: handler sleeps longer than `every`, `skip_if_running: true`.
- **When**: multiple periods elapse during one run.
- **Then**: concurrent executions do not stack (in-flight ≤ 1).
- **Signals**: concurrency gauge.

### S6 — fire_immediately semantics

- **Level**: Unit
- **Given**: two jobs, true vs false, same short period.
- **When**: register both.
- **Then**: true increments before one full period; false does not until ~one period.
- **Signals**: timestamps / counters.

### S7 — Jobs shutdown

- **Level**: Unit
- **Given**: running job(s).
- **When**: `shutdown()`.
- **Then**: completes without panic; no further handler calls.
- **Signals**: `Result::Ok`; counter stable.

### S10 — Enqueue and consume

- **Level**: Unit (`infra`)
- **Given**: `LocalMemoryQueue` capacity ≥ 1; subscribed handler.
- **When**: `enqueue(topic, payload)`.
- **Then**: handler receives equal payload.
- **Signals**: oneshot/channel assertion.

### S11 — Queue full

- **Level**: Unit
- **Given**: capacity N; no consumer (or stuck consumer).
- **When**: N+1 enqueues without drain.
- **Then**: at least one `EnqueueError::Full` (or after buffer filled).
- **Signals**: error variant.

### S12 — Ordering with single consumer

- **Level**: Unit
- **Given**: consumer records order.
- **When**: enqueue 1..k quickly.
- **Then**: processed order is 1..k.
- **Signals**: vec equality.

### S13 — Queue shutdown

- **Level**: Unit
- **Given**: active subscribe.
- **When**: `shutdown()`.
- **Then**: clean; further enqueue fails with shutting down (or documented error).
- **Signals**: result codes.

### S14 — Automation due run via jobs-wired tick

- **Level**: Service
- **Given**: scheduled automation due; scheduler started with `LocalScheduler` (not only direct `tick_due_schedules` bypass).
- **When**: first tick (immediate) or short test interval.
- **Then**: run starts or domain start-failure rules apply; `next_run_at` advances when scheduled.
- **Signals**: DB/run fixtures; existing APP-017 assertions updated for jobs wiring.

### S15 — Pause and already_running unchanged

- **Level**: Service
- **Given**: paused automation or active run.
- **When**: tick fires.
- **Then**: no illegal double start; paused not started.
- **Signals**: existing validation.

### S16 — No raw schedule interval loop

- **Level**: Service + static
- **Given**: migrated `scheduler_service.rs`.
- **When**: `rg` / review.
- **Then**: no product `tokio::time::interval` loop for schedule tick; recover → normalize → `set_interval_job` order preserved.
- **Signals**: source structure.

### S17 — Manual run does not use jobs/queue

- **Level**: Service + static
- **Given**: manual run entrypoints.
- **When**: reviewed / tested.
- **Then**: path calls service start directly; no `enqueue` / `set_interval_job` for that action.
- **Signals**: `rg` on call path; unit/service tests still pass.

### S18 — GitHub ingress enqueues

- **Level**: Service / API
- **Given**: mock `Queue` recording enqueues.
- **When**: valid delivery hits ingress.
- **Then**: one message on `automation.github_delivery` (or catalog topic); ingress does not run full start_run inline.
- **Signals**: mock enqueue count.

### S19 — Consumer invokes domain

- **Level**: Service
- **Given**: enqueued payload; consumer registered.
- **When**: message processed.
- **Then**: domain handler/claim/start path invoked once per new delivery.
- **Signals**: mock service; claim table if used.

### S20 — AI usage attach_jobs

- **Level**: Service
- **Given**: service constructed without running timer; interval configured; `attach_jobs`.
- **When**: period elapses (`fire_immediately: false` respected).
- **Then**: refresh runs and publishes.
- **Signals**: mock provider / broadcast.

### S21 — AI usage interval replace

- **Level**: Service
- **Given**: auto-refresh on.
- **When**: interval changed.
- **Then**: single job id registration; old cadence gone.
- **Signals**: scheduler `is_registered`; generation.

### S22 — AI usage disable

- **Level**: Service
- **Given**: auto-refresh on.
- **When**: interval `None`.
- **Then**: job cancelled; no further refresh.
- **Signals**: cancel + counter stop.

### S23 — Agent-hooks cleanup on jobs

- **Level**: Integration / static
- **Given**: API bootstrap after migration.
- **When**: inspect registration / source.
- **Then**: `agent-hooks.idle_session_cleanup` registered via jobs; `spawn_idle_session_cleanup` raw loop removed from main.
- **Signals**: `rg`; optional test that job id is registered.

### S24 — Layering

- **Level**: Static
- **Given**: `infra/src/jobs/**`, `infra/src/queue/**`.
- **When**: import review.
- **Then**: no automation/agent/usage domain modules imported.
- **Signals**: `rg`.

### S25 — Inventory non-migration

- **Level**: Review
- **Given**: TECH do-not-migrate list.
- **When**: PR diff.
- **Then**: relay ping, PTY pumps, process_runner cancel poll, manual run not force-moved into jobs/queue incorrectly.
- **Signals**: review checklist.

## Performance & load budgets

- Unit tests use short intervals (ms) where possible.
- Queue capacity tests must not hang (timeout).
- Automation 30s period not used as real sleep in default unit tests—inject short period or call tick via jobs with test interval if scheduler allows override in tests.

## Regression checklist

- [ ] recover_running_runs + normalize_missed_schedules still run **before** first automation tick registration completes its first due scan order as today.
- [ ] Automation start-failure still **pauses schedule** (domain), not infinite job retry.
- [ ] No dual automation tick loops.
- [ ] UsageService does not start a private timer before `attach_jobs`.
- [ ] GitHub duplicate delivery still idempotent via claim/domain.
- [ ] Manual run latency/error shape unchanged (sync validation errors still returned).
- [ ] Shutdown does not hang on jobs/queue.

## Exploratory agent-browser checks

None (no UI surface).

## Acceptance criteria

- [ ] M1–M12 each have scenario coverage paths above.
- [ ] `cargo test -p infra` covers S1–S7 and S10–S13 (or documented equivalents).
- [ ] Migrated product sites have passing service/static proof (S14–S23).
- [ ] No apalis/external MQ required for v1 default build.
- [ ] AGENTS docs updated (jobs/queue ports; entry-style rules).
- [ ] Scoped `cargo test` / clippy on `infra`, `core-service`, `quota-usage`, `api` pass.
- [ ] Coverage Status filled by `atmos-specs-test-run` after implementation.

## Manual verification steps

Optional:

1. `just dev-api` — enable AI usage 1m refresh; confirm updates without errors.
2. Near-term scheduled automation fires once; pause stops further scheduled starts.
3. Manual Run still immediate with clear errors.
4. GitHub (or fixture) delivery: ingress returns promptly; run/claim occurs via consumer path.
5. Clean process shutdown.

## Non-coverage

- Cloud/distributed adapters.
- Durable SQLite queue (N3).
- Per-automation cron job registration.
- Job/queue admin UI.
- Load tests for thousands of topics.
- Exactly-once cross-process delivery.

## Coverage Status

> Filled after implementation by `atmos-specs-test-run`.
