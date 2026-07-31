# Brainstorm · APP-051: Infra Jobs & Queue (Local-First)

> Problem space and exploration. Settled content graduates to PRD.md; committed architecture graduates to TECH.md.

## Context

- **Trigger**: Refactoring found `crates/infra` `jobs/` and `queue/` as empty placeholders, while product scheduled work and event work are ad-hoc (`tokio::interval`, inline spawns).
- **Product shape**: Atmos is a **local, single-user, single-process Computer** today—not a multi-tenant job cluster.
- **Who feels it**: Backend engineers (duplicated timers, no shared cancel/retry/shutdown story). End users only feel regressions if automation / AI usage / hooks timing breaks.
- **Current workarounds**:
  - Automations: 30s poll loop + domain cron/`next_run_at` (APP-017).
  - AI usage: private interval `JoinHandle` with abort/replace.
  - Agent hooks idle cleanup: raw interval in `apps/api` main.
  - GitHub/event paths: sync or ad-hoc async inside handlers (no shared queue port).
  - Manual run: direct service call (correct; keep).

## Goals (draft)

- Primary: **Stable infra ports** — `jobs` (time-driven) and `queue` (event-driven) so business code stops owning timers/buffers.
- Primary: **Local adapters only in v1** — simple, correct for single-process.
- Primary: Migrate **product** scheduled loops onto `jobs`; route **external events** through `queue`; keep **manual** as direct API→service.
- Secondary: Leave a **narrow extension path** for future cloud/distributed adapters without promising zero business change.
- Non-goal: apalis / Rabbit / Redis / distributed schedulers in v1.

## Options (historical)

### Option A — apalis (or similar) as v1 job engine

**Pros**: Real worker/retry ecosystem.  
**Cons**: Heavy for local single-user; poor fit for dynamic closures; blurs job vs MQ; API churn.  
**Verdict**: Rejected for v1.

### Option B — Hand-rolled local scheduler + in-memory queue behind traits (chosen)

**Pros**: Matches Atmos scale; thin; testable; business sees one API.  
**Cons**: Must reimplement cloud later if needed—acceptable.  
**Verdict**: **Chosen.**

### Option C — Per-automation apalis/cron job as schedule truth

**Pros**: “Pure” scheduler textbook model.  
**Cons**: Dual source of truth with APP-017 DB (pause, next_run, no backfill); rehydrate cost; little benefit single-process.  
**Verdict**: Rejected as v1 automation model. Domain tables remain schedule authority; one meta tick job drives polling.

### Option D — Everything is a job (including manual and events)

**Pros**: One concept.  
**Cons**: Manual needs sync errors/run id; events need buffer/ack semantics → wrong tools.  
**Verdict**: Rejected. Three entry styles: Jobs / Queue / Direct.

## Key forks (resolved)

| Fork | Decision |
|------|----------|
| Job library in v1 | **No apalis**; local Tokio-based adapter |
| Queue implementation | **In-process bounded memory**; not external MQ; not apalis |
| Automation schedule | **One interval job** `automation.schedule_tick` + domain `next_run_at` |
| Manual run | **Direct service**; never jobs/queue |
| GitHub / external events | **`infra::queue`** then consumer → domain |
| Cloud later | **Adapter/trait seam only**; no full distributed semantics in v1 |
| AI usage retry | **Parity first** (`RetryPolicy::none` default); optional later |
| Automation first tick | **`fire_immediately: true`** (match today’s interval) |

## Open questions

- [x] apalis in v1? → No.
- [x] Queue = MQ library? → No for v1.
- [x] Automation meta tick vs per-automation job? → Meta tick.
- [ ] Exact bounded-queue full policy (block vs error) — decide in TECH.
- [ ] Whether durable local outbox for queue is N1 — decide in PRD/TECH (default N1, not M).

## References

- Code: `crates/infra/src/jobs/mod.rs`, `queue/mod.rs`, `lib.rs`
- `crates/core-service/src/service/automation/scheduler_service.rs`, `scheduler.rs`
- `crates/ai-usage/src/service.rs`
- `apps/api/src/main.rs` (`start_scheduler`, `spawn_idle_session_cleanup`)
- Specs: `APP-017_atmos-automations`, `APP-019_github-automation-triggers`

## Ready to promote

- Promote to PRD: dual ports Jobs+Queue; local-first; migration inventory; manual exclusion; cloud as future adapter only.
- Promote to TECH: trait shapes, Local adapters, automation tick job, queue topics, bootstrap, tests.
