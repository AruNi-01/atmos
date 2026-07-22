# REVIEW · APP-042: Disk Analyzer - Implementation Review

> Post-implementation review log for Greptile + CodeRabbit findings on PR #168.

**Review date**: 2026-07-22  
**Review scope**: security, architecture, functional correctness, frontend, tests  
**Related code**: `crates/core-engine/src/disk_analyzer`, `crates/core-service/src/service/disk_analyzer.rs`, `apps/api/src/api/ws/router/disk_analyzer.rs`, `apps/web/src/features/disk-analyzer`

---

## Index

| Id | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| REV-001 | P1 | api/security | Scan session ownership + unicast progress | fixed |
| REV-002 | P1 | api/security | Delete must stay inside scan root | fixed |
| REV-003 | P1 | architecture | Move disk-analyzer business logic to core-service | fixed |
| REV-004 | P1 | backend | Bound scan-session retention (limit + TTL) | fixed |
| REV-005 | P1 | backend | Deduplicate hard-linked files | fixed |
| REV-006 | P1 | frontend | Escape ECharts tooltip HTML (XSS) | fixed |
| REV-007 | P1 | frontend | Ignore progress without matching scanId | fixed |
| REV-008 | P1 | frontend | diskInfo failure must not fail running scan | fixed |
| REV-009 | P1 | backend | Portable filesystem-root delete guard | fixed |
| REV-010 | P1 | api | Offload delete via spawn_blocking | fixed |
| REV-011 | P1 | api | Release session lock before tree prune/clone | fixed |
| REV-012 | P2 | backend | Count process_read_dir errors | fixed |
| REV-013 | P2 | backend | Suggestions before prune | fixed |
| REV-014 | P2 | frontend | Keep filtered descendants filtered | fixed |
| REV-015 | P2 | frontend | Localize Atmos/scanFailed strings | fixed |
| REV-016 | P2 | test/docs | Strengthen TEST/TECH contracts | fixed |
| REV-017 | P3 | deps | Prefer fs4; uuid as dev-dependency | fixed |
| REV-018 | P3 | frontend | Reuse formatBytes in chart tooltip | fixed |

---

## REV-001 · Scan session ownership + unicast progress

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | api/security |
| **Reported by** | Greptile / CodeRabbit |

### Finding
Scan sessions lacked owner binding; progress/tree were broadcast to all WS clients.

### Required fix
Persist `owner_conn_id`; cancel/get_tree/delete require ownership; progress/completion via `send_to` only.

### Fix log
- 2026-07-22 - `DiskAnalyzerService` owns sessions; API event forwarder unicasts by `owner_conn_id`.

---

## REV-002 · Delete must stay inside scan root

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | api/security |
| **Reported by** | Greptile |

### Finding
`DiskAnalyzerDelete` accepted any path the process could write.

### Required fix
Require `scan_id`; path must canonicalize under that session's root; refuse roots.

### Fix log
- 2026-07-22 - delete API requires `scan_id` + ownership + root containment.

---

## REV-003 · core-service ownership

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | architecture |
| **Reported by** | CodeRabbit |

### Finding
API called `DiskAnalyzerEngine` and held session state directly.

### Required fix
Introduce `DiskAnalyzerService` in `core-service`; API stays thin.

### Fix log
- 2026-07-22 - service owns engine, sessions, project-root resolution, events.

---

## REV-004–REV-018

Remaining items in the index were fixed in the same change set (engine hardlink/error/root/suggestion ordering; frontend XSS/i18n/filters/scanId; TEST/TECH updates; fs4 + uuid dev-dep; formatBytes reuse).
