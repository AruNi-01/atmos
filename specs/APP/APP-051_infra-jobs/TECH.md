# TECH · APP-051: Infra Jobs & Queue (Local-First)

> Technical Design · HOW. Implements PRD APP-051 (M1–M12). N1–N5 optional.

## Scope summary

Introduce **two narrow L1 ports** in `crates/infra`:

| Port | Driver | v1 adapter |
|------|--------|------------|
| `jobs` | Time (interval; optional cron later) | `LocalScheduler` (Tokio) |
| `queue` | Events (enqueue → consumer) | `LocalMemoryQueue` (bounded channel) |

Wire them from `apps/api`, migrate product timers and event intake, keep **manual runs direct**.  
**No apalis, no external MQ in v1.** Future cloud backends are adapter-shaped notes only.

---

## Architecture overview

```text
┌──────────────────────────────────────────────────────────────────┐
│ apps/api                                                          │
│  build LocalScheduler + LocalMemoryQueue                          │
│  start / inject Arc<dyn Jobs> + Arc<dyn Queue> (or concrete Arc)│
│  shutdown on process exit                                         │
└───────────────┬─────────────────────────────┬────────────────────┘
                │                             │
                ▼                             ▼
         jobs port                      queue port
         (time)                         (events)
                │                             │
    ┌───────────┼───────────┐                 │
    ▼           ▼           ▼                 ▼
 automation  quota-usage   agent-hooks     github/hooks
 schedule_   auto_      idle_           consumer →
 tick job    refresh    cleanup         domain service
    │
    ▼
 domain: next_run_at / pause / start_run  (APP-017)
                ▲
 manual Run ────┘  direct service call (no port)
```

### Layer rules

| Layer | Owns | Must not |
|-------|------|----------|
| `infra::jobs` / `queue` | timers, channels, retry *primitives*, lifecycle | automation pause, agent start, GitHub matching, usage providers |
| `core-service` / `quota-usage` | domain handlers, when to upsert/cancel/enqueue | raw product-level `tokio::interval` loops for migrated sites |
| `apps/api` | compose adapters, bootstrap order, thin HTTP/WS ingress | long domain work on webhook task when queue path exists |

```text
apps/api → core-service / quota-usage → infra
infra does not depend on core-service or quota-usage
```

---

## Design principles (normative)

1. **Local-first**: v1 adapters are in-process only; correct for single-user Atmos Computer.
2. **Narrow ports**: Prefer small traits over a mini-Celery API.
3. **Adapter seam**: Business depends on ports; `apps/api` selects Local implementation. Future `Cloud*` adapters may exist without rewriting domain *rules*, but may require new payload types—**do not claim zero-change cloud swap**.
4. **Three entry styles**:
   - **Jobs** — time-driven product work  
   - **Queue** — external/async event work  
   - **Direct** — interactive user commands (manual run)
5. **Automation schedule authority** remains domain DB + `scheduler.rs`; jobs only supply the tick.

---

## Module-by-module design

### crates/infra

```text
crates/infra/src/
├── jobs/
│   ├── mod.rs           # re-exports
│   ├── types.rs         # JobId, IntervalSpec, RetryPolicy, JobError
│   ├── port.rs          # trait Jobs
│   ├── local.rs         # LocalScheduler
│   └── tests.rs
├── queue/
│   ├── mod.rs
│   ├── types.rs         # Topic, QueueMessage, EnqueueError, ...
│   ├── port.rs          # trait Queue
│   ├── local.rs         # LocalMemoryQueue
│   └── tests.rs
└── lib.rs               # pub mod jobs; pub mod queue;
```

Remove “TODO placeholder” comments; document real modules in `crates/infra/AGENTS.md`:

- L1 includes **persistence and local runtime primitives** (db, jobs, queue).
- NEVER domain business rules inside adapters.

#### Jobs public API (intent)

```rust
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct JobId(pub Arc<str>);

#[derive(Clone, Debug)]
pub struct IntervalSpec {
    pub every: Duration,
    /// Default true for product jobs that must not overlap.
    pub skip_if_running: bool,
    /// If true, first run soon after register (automation tick).
    /// If false, wait one period (AI usage, hooks cleanup — match prior “skip first tick”).
    pub fire_immediately: bool,
}

#[derive(Clone, Debug)]
pub struct RetryPolicy {
    pub max_attempts: u32, // 1 = no extra retries
    pub initial_delay: Duration,
    pub max_delay: Duration,
    pub multiplier: f64,
}

impl RetryPolicy {
    pub fn none() -> Self { /* max_attempts = 1 */ }
}

pub enum JobError {
    Retryable(String),
    Fatal(String),
}
pub type JobResult = Result<(), JobError>;

#[async_trait]
pub trait Jobs: Send + Sync {
    async fn set_interval_job<F, Fut>(
        &self,
        id: JobId,
        spec: IntervalSpec,
        retry: RetryPolicy,
        handler: F,
    ) -> Result<(), JobsError>
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: Future<Output = JobResult> + Send + 'static;

    async fn cancel(&self, id: &JobId) -> Result<(), JobsError>;
    fn is_registered(&self, id: &JobId) -> bool;
    async fn shutdown(&self) -> Result<(), JobsError>;
}

pub struct LocalScheduler { /* private registry + JoinHandles */ }

impl LocalScheduler {
    pub fn new() -> Self;
    // implements Jobs
}
```

**Semantics:**

- `set_interval_job` with an existing `JobId` **replaces** the previous registration (cancel old, start new).
- `skip_if_running`: if a tick is still executing, skip starting another (no burst catch-up). Document as intentional vs old `MissedTickBehavior::Burst`.
- Retry: if `max_attempts > 1`, LocalScheduler wraps a single firing with simple backoff; default for migrated timers is **`RetryPolicy::none()`**.
- No apalis types in the public surface.

**N1 (optional later):** `set_cron_job(...)` on the same trait—still local.

#### Queue public API (intent)

```rust
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Topic(pub Arc<str>);

/// Opaque bytes or a small enum; prefer typed wrappers in business crates.
pub struct QueueMessage {
    pub id: String,              // unique message id (uuid)
    pub payload: Vec<u8>,        // or Bytes; business serializes JSON
    pub enqueued_at: DateTime<Utc>,
}

pub enum EnqueueError {
    Full,
    ShuttingDown,
    // ...
}

#[async_trait]
pub trait Queue: Send + Sync {
    /// Bounded; on full → EnqueueError::Full (v1 default: fail fast, no unbounded growth).
    async fn enqueue(&self, topic: &Topic, payload: Vec<u8>) -> Result<String /* msg id */, EnqueueError>;

    /// Register a consumer. Multiple consumers optional later; v1: one consumer task per topic is enough.
    async fn subscribe<F, Fut>(&self, topic: Topic, handler: F) -> Result<(), QueueError>
    where
        F: Fn(QueueMessage) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<(), QueueError>> + Send + 'static;

    async fn shutdown(&self) -> Result<(), QueueError>;
}

pub struct LocalMemoryQueue {
    // per-topic: mpsc/flume with capacity C
}
```

**v1 queue policy (decisive):**

| Concern | Choice |
|---------|--------|
| Capacity | Fixed per topic (e.g. 64–256; constant in LocalMemoryQueue builder) |
| Full behavior | **`EnqueueError::Full`** (ingress logs + returns retryable error to upstream if HTTP) |
| Persistence | **None** (memory only) |
| Retry on handler failure | Optional simple re-attempt count inside consumer **or** log + drop; prefer **log + drop** for v1 if domain + GitHub retry cover correctness; document |
| Ordering | Best-effort FIFO per topic, single consumer |

**Not an MQ:** no consumer groups, no cross-process delivery, no broker.

#### Injection style

Prefer concrete `Arc<LocalScheduler>` / `Arc<LocalMemoryQueue>` in `apps/api` **or** `Arc<dyn Jobs>` / `Arc<dyn Queue>` if object-safety is solved (async trait + boxed futures).  

**Recommendation:** use **concrete Arc types** exported from infra for v1 simplicity; keep logic behind `impl Jobs for LocalScheduler` so a future type can share the trait in tests/mocks.

Provide test helpers: `LocalScheduler::new()`, `LocalMemoryQueue::builder().capacity(16).build()`.

---

### Automations (`core-service`)

#### Schedule tick (M6)

**Keep:**

- `scheduler.rs` — cron math, normalize, preview  
- DB fields and repo `list_due_scheduled_automations`, pause, etc.  
- `tick_due_schedules`, `recover_running_runs`, `normalize_missed_schedules`

**Change `start_scheduler`:**

```text
async fn start_scheduler(self: Arc<Self>, jobs: Arc<LocalScheduler> /* or dyn Jobs */) {
  recover_running_runs().await?;
  normalize_missed_schedules().await?;
  jobs.set_interval_job(
    JobId::from("automation.schedule_tick"),
    IntervalSpec {
      every: Duration::from_secs(30),
      skip_if_running: true,
      fire_immediately: true,  // parity with tokio::interval first tick
    },
    RetryPolicy::none(),
    { let this = self.clone(); move || {
        let this = this.clone();
        async move {
          this.tick_due_schedules().await
            .map_err(|e| JobError::Retryable(e.to_string()))
        }
    }},
  ).await?;
}
```

Remove the private `tokio::time::interval` loop from `scheduler_service.rs`.

**Not in v1:** registering one cron job per automation id.

#### Manual run (M7)

Unchanged path: WS/API → `start_run` / equivalent. **No** `jobs` / `queue` calls.

#### GitHub / external triggers (M8)

**Ingress (apps/api or existing trigger module):**

1. Validate request  
2. Cheap idempotency gate if already claimed (optional pre-check)  
3. `queue.enqueue(Topic::from("automation.github_delivery"), payload_json)`  
4. Return success to upstream when enqueue succeeds  

**Consumer (registered at bootstrap from core-service or api):**

- Deserialize payload  
- Existing domain: delivery claim, match automations, `start_run`  
- On domain “already processed,” ack as success  

Do not move claim tables into infra.

---

### AI usage (M9)

**Bootstrap order (fixes current `UsageService::new` starting a timer too early):**

1. Construct `UsageService` **without** starting auto-refresh (or with jobs handle optional and inert).  
2. `jobs` ready.  
3. `usage.attach_jobs(jobs.clone())` reads persisted interval and `set_interval_job` / `cancel`.  
4. `set_auto_refresh_interval` only goes through jobs after attach.

```text
JobId: "quota-usage.auto_refresh"
IntervalSpec: every = minutes * 60s, skip_if_running: true, fire_immediately: false
RetryPolicy: none()  // parity with “fail once, wait next interval”
```

Remove private `JoinHandle` interval path after cutover.

---

### Agent-hooks idle cleanup (M10)

Move `spawn_idle_session_cleanup` in `apps/api/src/main.rs` to:

```text
JobId: "agent-hooks.idle_session_cleanup"
every: 5 minutes
fire_immediately: false  // match current skip first tick
handler: clear_idle_older_than / clear_stale_active_older_than
```

---

### apps/api bootstrap

```text
let jobs = Arc::new(LocalScheduler::new());
let queue = Arc::new(LocalMemoryQueue::builder().capacity(128).build());

// subscribe queue consumers (github, etc.)
// construct services with jobs/queue arcs
// attach quota-usage jobs
// automation.start_scheduler(jobs.clone()).await
// register agent-hooks cleanup job

// on shutdown signal:
jobs.shutdown().await?;
queue.shutdown().await?;
// then close DB
```

Store on `AppState` if useful for future registrations.

---

## Data model

### v1

- **No new SeaORM tables** for jobs/queue.  
- Automation schedule tables **unchanged** (APP-017).  
- In-process maps + channels only.

### Future (N3 / cloud) — non-normative

- Durable queue: SQLite outbox table or external broker adapter.  
- Cloud jobs: may require serializable job payloads; Local’s `'static` closures would not port 1:1.

---

## Job id & topic catalog (v1)

### Jobs

| JobId | Owner | fire_immediately | Notes |
|-------|--------|------------------|-------|
| `automation.schedule_tick` | core-service | true | 30s due poll |
| `quota-usage.auto_refresh` | quota-usage | false | replace on config change |
| `agent-hooks.idle_session_cleanup` | apps/api + AgentHooksService | false | 5m |

### Queue topics

| Topic | Producer | Consumer |
|-------|----------|----------|
| `automation.github_delivery` | API/webhook ingress | automation github trigger domain |

Add new product ids to this catalog (or AGENTS) when introduced.

---

## Scheduled / event inventory (M12)

### Migrate

| Site | Mechanism today | Target |
|------|-----------------|--------|
| Automation schedule tick | `scheduler_service` interval | **jobs** |
| AI usage auto-refresh | `service.rs` JoinHandle interval | **jobs** |
| Agent-hooks idle cleanup | `main.rs` `spawn_idle_session_cleanup` | **jobs** |
| GitHub automation delivery | inline / ad-hoc async in trigger path | **queue** |

### Do not migrate

| Site | Reason |
|------|--------|
| Relay ingest ping interval | Connection keepalive |
| PTY / stream reader spawns | Long-lived IO |
| Request-scoped `tokio::spawn` in WS handlers | One-shot request work |
| Automation process_runner cancel poll (~500ms) | Per-run supervision, not product schedule |
| Manual automation run | Direct service (M7) |

---

## Transport

No new user-facing WS/REST for job/queue admin.  
Webhook/HTTP for GitHub remains; body handling becomes validate + enqueue.

---

## Observability

- `tracing` fields: `job_id` / `topic` / `msg_id` / `duration_ms` / `outcome`.  
- Queue full: `warn!` + metric-friendly log.  
- Do not log secrets (cookies, tokens) from AI usage or webhook bodies at error level without redaction.

---

## Rollout plan

1. **Infra ports + Local adapters + unit tests** (`cargo test -p infra`). Export from `lib.rs`. Update `crates/infra/AGENTS.md`.
2. **API bootstrap** empty consumers/jobs (runtime up, no product migration).
3. **Migrate AI usage** (attach_jobs + parity tests).
4. **Migrate agent-hooks cleanup**.
5. **Migrate automation schedule tick** (`fire_immediately: true`, recover→normalize→register order).
6. **Migrate GitHub path to queue** (enqueue + consumer; claim semantics preserved).
7. **Docs**: root/`crates` AGENTS decision tree — scheduled → jobs, events → queue, interactive → direct.

Atomic cutover per site; no dual interval loops.

---

## Future cloud adapters (N4, non-ship)

Document only:

```text
trait Jobs / Queue remain the business dependency.
CloudJobs / CloudQueue would implement the same traits with:
  - serializable payloads (handlers re-bound in worker processes)
  - durable storage / broker
  - different cancel semantics (best-effort)
Migration may require business payload DTOs; not free.
```

v1 **must not** implement these.

---

## Risks & tradeoffs

| Item | Mitigation |
|------|------------|
| Memory queue drop on crash after 2xx | GitHub retries + domain claim; N3 if needed |
| Queue full | Bounded + Full error; ingress returns retryable |
| `skip_if_running` vs old Burst catch-up | Intentional; lag ≤ interval + tick duration |
| Over-wide traits for “cloud ready” | Keep API minimal; evolve when cloud exists |
| UsageService early timer | attach_jobs bootstrap order (M9) |
| Dual source of truth if per-automation jobs | Explicitly not doing that in v1 |

**Rollback:** revert call-site PRs; Local adapters can remain unused.

**Tradeoff — meta tick vs per-automation job:** Meta tick matches APP-017 authority and single-process cost model; chosen as optimal for Atmos.

**Tradeoff — no apalis/MQ:** Correct for local app scale; re-evaluate only with multi-instance cloud requirements.

---

## Testing (see TEST.md)

- Unit: LocalScheduler register/cancel/replace/skip_if_running/shutdown.  
- Unit: LocalMemoryQueue enqueue/subscribe/full/shutdown.  
- Service: automation tick parity; AI usage attach/replace/disable; hooks job registered.  
- Queue: github payload consumer calls domain (mock).  
- Static: no raw interval at migrated sites; manual path free of queue/jobs.

---

## Dependencies & compatibility

- **No new heavy deps required** for v1 (Tokio already in infra). Optional: `flume` if preferred over `tokio::sync::mpsc`.  
- Depends on APP-017/019 behavior remaining stable.  
- `quota-usage` already depends on `infra` — OK for jobs port.

---

## AGENTS updates (implementation checklist)

| File | Change |
|------|--------|
| `crates/infra/AGENTS.md` | jobs/queue real; local adapters; NEVER domain rules |
| Root / `crates/AGENTS.md` | Decision: time → jobs, events → queue, interactive → direct |
| `core-service` / `quota-usage` AGENTS | Point at ports for timers |

---

## Open questions

- [x] Engine = Local  
- [x] Automation = meta tick  
- [x] Manual = direct  
- [x] Events = queue  
- [x] Default retry = none  
- [x] Queue full = error  
- [ ] Exact default capacity number (suggest **128**) — confirm at impl if needed  
- [ ] Object-safe dyn vs concrete Arc — prefer concrete Arc + trait for tests  

---

## Pseudocode reference

```rust
// apps/api
let jobs = Arc::new(LocalScheduler::new());
let queue = Arc::new(LocalMemoryQueue::builder().capacity(128).build());

queue.subscribe(Topic::from("automation.github_delivery"), {
  let automation = automation.clone();
  move |msg| {
    let automation = automation.clone();
    async move { automation.handle_github_queue_message(msg.payload).await }
  }
}).await?;

automation.start_scheduler(jobs.clone()).await?;
usage.attach_jobs(jobs.clone()).await?;
jobs.set_interval_job(
  JobId::from("agent-hooks.idle_session_cleanup"),
  IntervalSpec { every: Duration::from_secs(300), skip_if_running: true, fire_immediately: false },
  RetryPolicy::none(),
  { /* clear idle */ },
).await?;
```
