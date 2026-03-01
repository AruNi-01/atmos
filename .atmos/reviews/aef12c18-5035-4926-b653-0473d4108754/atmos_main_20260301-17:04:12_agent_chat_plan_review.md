# Code Review Report

| Entry | Details |
| :--- | :--- |
| **Date** | 2026-03-01 17:04 |
| **Reviewer** | AI (fullstack-reviewer) |
| **Scope** | Current working tree changes (`git diff` + untracked review artifact) |
| **Project Stack** | TypeScript + React (Next.js) / Markdown skill configuration |
| **Overall Assessment** | **COMMENT** |

---

## Summary

| Metric | Value |
|--------|-------|
| Files Reviewed | 6 |
| Lines Changed | +282 / -32 |
| P0 (Critical) | 0 |
| P1 (High) | 0 |
| P2 (Medium) | 2 |
| P3 (Low) | 1 |

---

## Findings by Severity

### 🔴 P0 — Critical
> None found. ✅

### 🟠 P1 — High
> None found. ✅

### 🟡 P2 — Medium

- **`apps/web/src/components/agent/AgentChatPanel.tsx:466`** — Unused/duplicated plan-update path in reducer
  - **Category**: Maintainability
  - **Issue**: `reduceEntries` still implements `msg.type === "plan_update"`, but live message handling now processes `plan_update` via `setCurrentPlan` in the outer switch (`case "plan_update"`), without calling `reduceEntries`. This leaves a dead logic path that can drift from runtime behavior.
  - **Suggestion**: Remove reducer-side `plan_update` handling, or route all plan updates through `reduceEntries` consistently.
    ```tsx
    // Option A: keep a single source of truth
    case "plan_update":
      if (stoppedRef.current) return;
      setEntries((prev) => reduceEntries(prev, msg));
      setCurrentPlan(msg.plan);
      break;
    ```

- **`apps/web/src/components/agent/AgentChatPanel.tsx:849`** — Nested component with hooks recreated on every parent render
  - **Category**: Performance
  - **Issue**: `PlanEntryScrollableText` is declared inside `PlanBlockView` and uses hooks (`useRef`, `useEffect`, `useCallback`). This recreates component identity every render, forcing remounts for all plan rows and restarting hover animation state.
  - **Suggestion**: Hoist `PlanEntryScrollableText` to module scope and pass props.
    ```tsx
    function PlanEntryScrollableText(props: {...}) { ... }

    function PlanBlockView(...) {
      return <PlanEntryScrollableText ... />;
    }
    ```

### 🟢 P3 — Low

- **`apps/web/src/components/agent/AgentChatPanel.tsx:108`** — Heuristic filter for Todo tool calls is string-fragile
  - **Category**: Logic
  - **Issue**: `isPlanUpdateToolCall` depends on tool name and text matching (`"todo list updated"`), which may hide non-plan tool calls if phrasing overlaps.
  - **Suggestion**: Prefer explicit protocol metadata (e.g., dedicated message type/flag) over string heuristics when available.

---

## Findings by File

### `apps/web/src/components/agent/AgentChatPanel.tsx`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 466 | P2 | Maintainability | Reducer has plan-update path not used by live switch flow | Consolidate to one plan-update handling path |
| 849 | P2 | Performance | Nested hook-based component remounts each parent render | Hoist `PlanEntryScrollableText` to top level |
| 108 | P3 | Logic | String-based Todo filtering can over-match | Use explicit metadata/type marker |

### `.atmos/context/task.md`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 1 | - | - | No functional issues found | N/A |

### `skills/code_review_skills/fullstack-reviewer/SKILL.md`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| - | - | - | No blocking issues found; guidance is clearer and better calibrated | N/A |

### `skills/code_review_skills/fullstack-reviewer/references/backend-checklist.md`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| - | - | - | No functional issues found | N/A |

### `skills/code_review_skills/fullstack-reviewer/references/security-checklist.md`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| - | - | - | No functional issues found | N/A |

### `.atmos/reviews/aef12c18-5035-4926-b653-0473d4108754/atmos_main_20260301-16:56:25_code_review.md`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| - | - | - | Untracked review artifact; not part of functional runtime code | Keep or clean up before commit as needed |

---

## Architecture Notes

- The shift to a docked, context-aware plan (`currentPlan` + `planByContextRef`) is directionally strong, but plan state now lives outside transcript blocks; keeping one canonical state path will reduce future drift.

## Positive Highlights

- Good UX improvement: plan persistence by context (`planByContextRef`) aligns with existing session stashing logic and avoids cross-context leakage.
- Nice transcript cleanup: suppressing TodoWrite tool chatter improves assistant message readability.
- Skill/checklist updates improve review quality by emphasizing evidence-based findings and severity calibration.

## Recommended Next Steps

1. Remove or consolidate duplicate `plan_update` handling to one code path.
2. Hoist `PlanEntryScrollableText` out of `PlanBlockView` to stabilize component identity.
3. Replace Todo filtering heuristics with explicit metadata where protocol support exists.
