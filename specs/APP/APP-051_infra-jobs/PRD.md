# PRD · APP-051: Infra Jobs & Queue (Local-First)

> Product Requirements · WHAT and WHY. Unified L1 ports for time-driven work (**jobs**) and event-driven work (**queue**), implemented with **local adapters** for single-user Atmos; business layers depend only on the ports.

## Context

- **Problem**: Product background work is ad-hoc. There is no shared place to register named schedules, cancel/replace them, buffer external events, or shut them down cleanly. `infra/jobs` and `infra/queue` are empty placeholders.
- **Why now**: Refactors already surface multiple timers (automations, AI usage, agent-hooks cleanup) and event-driven automation triggers (GitHub). Without a port, every feature reinvents the same loops.
- **Product constraint**: Atmos today is a **local, single-user, single-process Computer**. v1 must not require distributed brokers or multi-worker clusters.
- **Related specs**:
  - `APP-017_atmos-automations` — schedule semantics, pause, no sleep backfill (must not regress).
  - `APP-019_github-automation-triggers` — event delivery / claim patterns (queue must cooperate).
  - Layering: `infra` → services → `apps/api`.

## Goals

1. **Primary**: Ship **stable `infra::jobs` and `infra::queue` abstractions** used by business code for all *product* time-driven and *external event* async work.
2. **Primary**: Implement **Local adapters only** in v1 (process-local scheduler + bounded in-memory queue).
3. **Primary**: Migrate existing product scheduled loops onto `jobs`; route GitHub/external event intake through `queue`; keep **manual user actions as direct service calls**.
4. **Secondary**: Document an **adapter seam** so a future cloud/distributed implementation can be introduced without rewriting domain rules—without promising zero business change on day one of cloud.
5. **Secondary**: Named job/queue ids, simple retry hooks, graceful shutdown, testability via injection.

## Users & Scenarios

- **Primary persona**: Backend engineer adding scheduled or event-driven work.
- **Secondary persona**: End user of Automations / AI usage / hooks (behavior parity; no new Jobs UI).

### Key scenarios

1. API process starts → local jobs/queue runtimes start → automation tick, optional AI usage refresh, agent-hooks cleanup are registered.
2. User changes AI usage auto-refresh interval → previous job cancelled/replaced; no double timers.
3. Scheduled automation becomes due → tick job runs domain logic → run starts (or domain pause/failure rules apply).
4. GitHub delivery arrives → handler enqueues quickly → consumer runs domain matching/start with idempotency/claim.
5. User clicks **Run now** → API/WS calls service **directly** (no enqueue, no schedule job).
6. Process shutdown → jobs and queue stop without panics or orphaned tight loops.

## User Stories

- As a backend engineer, I want one jobs API for timers and one queue API for events, so I do not copy `tokio::interval` / ad-hoc channels per feature.
- As a backend engineer, I want handlers to stay in service crates, so `infra` remains free of automation/usage domain rules.
- As an Automations user, I want schedule/pause/next-run/manual-run behavior unchanged after the infra move.
- As a platform owner, I want local-first implementations now and a clear path to swap adapters if Atmos later runs multi-tenant cloud workers.

## Functional Requirements

### Must Have

- **M1 · Jobs port**: `crates/infra` exposes a documented **jobs** API (trait + types). Business crates depend on this port, not on a specific distributed job product.
- **M2 · Queue port**: `crates/infra` exposes a documented **queue** API (trait + types) for named topics, enqueue, and consumer registration.
- **M3 · Local jobs adapter**: v1 ships **only** a process-local scheduler (Tokio-based). Supports named interval jobs at minimum; cancel and replace-by-id.
- **M4 · Local queue adapter**: v1 ships **only** a process-local **bounded in-memory** queue with one or more consumers per topic. No external MQ dependency.
- **M5 · Lifecycle**: `apps/api` (or runtime owner) constructs adapters, starts them, injects into services, and shuts them down on process exit.
- **M6 · Automations schedule via jobs**: Domain schedule truth stays APP-017 (DB: expr, tz, pause, `next_run_at`). Infrastructure is **one interval job** (e.g. `automation.schedule_tick`) that invokes existing due-scan / start logic—not per-automation distributed cron in v1.
- **M7 · Automations manual run stays direct**: User-initiated run goes API/WS → service. **Must not** require jobs or queue.
- **M8 · External events via queue**: GitHub (and similar) trigger intake **enqueues** work; consumers execute domain logic (including existing idempotency/claim rules). Webhook/HTTP path must not own long business work when queue is available.
- **M9 · Migrate AI usage auto-refresh** onto jobs (cancel/replace on interval change/disable).
- **M10 · Migrate agent-hooks idle session cleanup** onto jobs (today’s ~5 minute loop in `apps/api`).
- **M11 · Layering**: Jobs/queue adapters contain **no** domain rules (no pause-schedule policy, no provider collect, no GitHub matching). Handlers are registered by upper layers.
- **M12 · Inventory discipline**: Spec lists migrate vs do-not-migrate. Connection keepalives, PTY/stream pumps, and request-scoped one-shot spawns are **not** force-migrated.

### Nice to Have

- **N1 · Cron helper on jobs port**: First-class cron schedule on the jobs API for *new* non-domain schedules (Automations still use domain cron + tick job).
- **N2 · Execution retry policy on jobs**: Optional max attempts + backoff for a single firing (default none for automation tick and AI usage in v1 parity mode).
- **N3 · Durable local queue**: SQLite/outbox-backed queue adapter for “ack then crash” safety—**not** required for v1 if upstream retries (e.g. GitHub) + claim cover the product risk.
- **N4 · Cloud adapter sketches**: Non-normative notes for future Redis/NATS/apalis-style backends; not implemented in this spec’s ship gate.
- **N5 · Debug listing**: List active job ids / queue depths for tracing/debug logs.

## Out of Scope

- **Distributed job systems / external MQ as v1 dependencies** (apalis, RabbitMQ, NATS, Redis Streams, Kafka, etc.).
- **Promising zero business-code change when moving to cloud** — adapters reduce coupling; cloud may still require serializable payloads or split workers.
- **Per-automation job registration as schedule authority** in v1 (rejected dual source of truth).
- **Jobs/Queue admin UI** for end users.
- **Guaranteed execution while Computer is asleep** (unchanged from APP-017).
- **Migrating every `tokio::spawn`** (IO pumps, relay pings, etc.).
- **Changing APP-017 product schedule semantics** (presets, pause, no backfill)—only the timer/event plumbing moves.

## Success Metrics

- **Leading**: No remaining *product* scheduled loops for automation tick, AI usage auto-refresh, or agent-hooks idle cleanup using raw private intervals outside `infra::jobs`.
- **Leading**: GitHub (or equivalent) automation event path enqueues via `infra::queue` rather than running full domain work inline on the ingress task (except thin validate + enqueue).
- **Leading**: Manual run path has zero jobs/queue dependency.
- **Lagging**: APP-017 schedule scenarios and AI usage interval change/disable remain green.
- **Qualitative**: Engineers describe “register job / enqueue message,” not “copy the automation interval loop.”

## Risks & Open Questions

- **Risk**: Over-abstracting for cloud early → fat traits. Mitigation: keep ports narrow (see TECH).
- **Risk**: Dual loops during migration. Mitigation: atomic cutover per registration site.
- **Risk**: In-memory queue loss on crash after HTTP 2xx. Mitigation: document; rely on provider retry + claim; N3 if product requires stronger durability.
- **Risk**: Treating queue as MQ in reviews. Mitigation: PRD/TECH state local buffer semantics explicitly.
- **Open (TECH)**: Queue full policy; exact job id catalog; bootstrap order with `UsageService` (no timer before jobs attach).

## Milestones

- **Phase 1 — Ports + Local adapters + tests** (M1–M5, core of M11).
- **Phase 2 — Migrate product call sites** (M6–M10, M12) with parity tests.
- **Phase 3 — Optional** N1–N5 as separate PRs after Phase 2 is green.

## Resolved product forks

| Topic | Decision |
|-------|----------|
| v1 engine | **Local only** (no apalis/MQ) |
| Extensibility | **Trait/adapter seam**; cloud later |
| Automation schedule | **Meta tick job + domain DB authority** |
| Manual | **Direct service** |
| Events | **Queue** |
| Default retries | **None** for migrated timers unless TECH opts in per job |
