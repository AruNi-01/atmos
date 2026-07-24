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
| REV-005 | P1 | backend | Deduplicate hard-linked files (Unix) | fixed |
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
| REV-019 | P1 | backend | TTL must not evict in-flight scans | fixed |
| REV-020 | P1 | backend | Deduplicate Windows hard links | fixed |
| REV-021 | P1 | backend | Windows allocated size (not logical len) | fixed |

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
- 2026-07-22 - `DiskAnalyzerService` owns sessions; API event forwarder unicasts by `owner_conn_id` (`apps/api/src/main.rs` `spawn_disk_analyzer_forwarder`).

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
- 2026-07-22 - delete API requires `scan_id` + ownership + `allowed_root` (`crates/core-engine/.../delete_path`, `DiskAnalyzerService::delete_path`).

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
- 2026-07-22 - `crates/core-service/src/service/disk_analyzer.rs`; API handlers only parse/route.

---

## REV-004 · Bound scan-session retention

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | CodeRabbit |

### Finding
Completed trees retained forever in an unbounded map.

### Fix log
- 2026-07-22 - `MAX_SESSIONS=8` + `SESSION_TTL=30m` in `DiskAnalyzerService`.

---

## REV-005 · Unix hard-link dedup

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | Greptile |

### Fix log
- 2026-07-22 - `file_identity` via `(dev, ino)`; `hardlinks_counted_once` test.

---

## REV-006 · Escape tooltip HTML

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | CodeRabbit |

### Fix log
- 2026-07-22 - `escapeHtml` in `DiskUsageChart.tsx`.

---

## REV-007 · Match scanId before applying events

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | CodeRabbit |

### Fix log
- 2026-07-22 - `scanIdRef` in `use-disk-analyzer.ts`; ignore events without active id.

---

## REV-008 · diskInfo best-effort

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | frontend |
| **Reported by** | CodeRabbit |

### Fix log
- 2026-07-22 - nested try around `diskInfo` after successful `startScan`.

---

## REV-009 · Portable FS-root delete guard

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | CodeRabbit |

### Fix log
- 2026-07-22 - `canonical.parent().is_none()`; `delete_refuses_filesystem_root` test.

---

## REV-010 · spawn_blocking delete

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | api |
| **Reported by** | CodeRabbit |

### Fix log
- 2026-07-22 - `DiskAnalyzerService::delete_path` uses `spawn_blocking`.

---

## REV-011 · Snapshot before prune

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | api |
| **Reported by** | CodeRabbit |

### Fix log
- 2026-07-22 - `get_tree` clones `Arc<DiskNode>` under lock, prunes outside.

---

## REV-012 · Count process_read_dir errors

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | CodeRabbit |

### Fix log
- 2026-07-22 - count dropped `Err` entries before `retain` in `process_read_dir`.

---

## REV-013 · Suggestions before prune

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | backend |
| **Reported by** | CodeRabbit |

### Fix log
- 2026-07-22 - `cleanup_suggestions` before `prune_tree`; `suggestions_computed_before_prune` test.

---

## REV-014 · Keep filtered descendants filtered

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | CodeRabbit |

### Fix log
- 2026-07-22 - `filterTree` always uses `childResults`; parent-match regression test.

---

## REV-015 · Localize Atmos / scanFailed

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | frontend |
| **Reported by** | CodeRabbit |

### Fix log
- 2026-07-22 - `projectLabel` prop + `DiskAnalyzer.scanFailed` en/zh.

---

## REV-016 · Strengthen TEST/TECH

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P2 |
| **Area** | test/docs |
| **Reported by** | Greptile / CodeRabbit |

### Fix log
- 2026-07-22 - ownership/unicast/delete bounds/allocated-size notes; trash happy-path marked partial.

---

## REV-017 · fs4 + uuid dev-dep

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P3 |
| **Area** | deps |
| **Reported by** | CodeRabbit |

### Fix log
- 2026-07-22 - `fs4` replaces `fs2`; `uuid` under `[dev-dependencies]`.

---

## REV-018 · Reuse formatBytes

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P3 |
| **Area** | frontend |
| **Reported by** | CodeRabbit |

### Fix log
- 2026-07-22 - chart tooltip uses shared `formatBytes`.

---

## REV-019 · TTL must not evict in-flight scans

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | CodeRabbit |

### Finding
`evict_expired` used `created_at` when `completed_at` was `None`, so scans longer than 30m could be removed while still running.

### Fix log
- 2026-07-22 - retain sessions with `completed_at == None`; TTL only after completion (`DiskAnalyzerService::evict_expired`).

---

## REV-020 · Windows hard-link dedup

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | Greptile |

### Finding
Non-Unix path counted every directory entry; NTFS hard links inflated totals.

### Fix log
- 2026-07-22 - `file_identity` uses `(volume_serial_number, file_index)` via `std::fs::metadata` on Windows.

---

## REV-021 · Windows allocated size

| Field | Value |
|-------|--------|
| **Status** | fixed |
| **Severity** | P1 |
| **Area** | backend |
| **Reported by** | Greptile |

### Finding
Non-Unix path used logical `meta.len()`, misreporting sparse / cluster allocation.

### Fix log
- 2026-07-22 - `windows_allocated_size` via `GetFileInformationByHandleEx` / `FILE_STANDARD_INFO.AllocationSize` (`windows-sys` target dep).
