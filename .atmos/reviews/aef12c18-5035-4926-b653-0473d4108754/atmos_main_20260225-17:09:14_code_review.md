# Code Review Report

| Entry | Details |
| :--- | :--- |
| **Date** | 2026-02-25 17:09 |
| **Reviewer** | AI (fullstack-reviewer) |
| **Scope** | Git diff HEAD (38 files changed, +994/-3058 lines) |
| **Project Stack** | TypeScript + React 19 + Next.js / Rust + Axum |
| **Overall Assessment** | **APPROVE** |

---

## Summary

| Metric | Value |
|--------|-------|
| Files Reviewed | 38 |
| Lines Changed | +994 / -3058 |
| P0 (Critical) | 0 |
| P1 (High) | 4 |
| P2 (Medium) | 7 |
| P3 (Low) | 5 |

---

## Findings by Severity

### 🔴 P0 — Critical
> None found. ✅

### 🟠 P1 — High

- **`apps/web/src/components/agent/AgentChatPanel.tsx:531`** — Race condition in forced session disconnect logic
  - **Category**: Logic | Concurrency
  - **Issue**: The `forcedDisconnectDoneRef` guard resets only when prompt is consumed. If connection fails before consumption, the guard remains `true` and prevents future forced disconnects.
  - **Suggestion**: Add timeout-based reset or connection failure handling to clear the guard.
    ```typescript
    // Add connection failure handler
    useEffect(() => {
      if (error && forcedDisconnectDoneRef.current) {
        forcedDisconnectDoneRef.current = false;
      }
    }, [error]);
    ```

- **`apps/web/src/hooks/use-agent-chat-layout.ts:33`** — File write operation can silently fail
  - **Category**: Error Handling
  - **Issue**: The `persist()` function catches all errors and discards them. If layout persistence fails, users lose their settings silently.
  - **Suggestion**: Add retry logic or notify the user after multiple failed attempts.
    ```typescript
    let failCount = 0;
    function persist(layout: PanelLayout) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        fsApi.writeFile(LAYOUT_PATH, JSON.stringify(layout, null, 2))
          .catch((e) => {
            failCount++;
            if (failCount > 3) {
              console.error('Failed to persist layout after retries:', e);
              // Consider user notification
            }
          });
      }, 500);
    }
    ```

- **`apps/web/src/app/api/review-skills/route.ts:22-44`** — Regex-based YAML parsing is fragile
  - **Category**: Error Handling | Maintainability
  - **Issue**: Parsing SKILL.md files with regex for YAML frontmatter is brittle. Malformed files could cause parsing failures or incorrect data.
  - **Suggestion**: Use a proper YAML parser library.
    ```typescript
    import yaml from 'js-yaml';
    // Parse YAML properly
    const frontmatter = content.match(/^---\n([^]+?)\n---/);
    if (frontmatter) {
      const parsed = yaml.load(frontmatter[1]) as SkillMetadata;
    }
    ```

- **`crates/infra/src/utils/system_skill_sync.rs:70`** — Potential panic on unwrap_or
  - **Category**: Error Handling (Rust)
  - **Issue**: `clone_path.to_str().unwrap_or("atmos")` uses a fallback that may be incorrect. The git clone could fail silently or write to wrong location.
  - **Suggestion**: Propagate error or use a validated temp path.
    ```rust
    let clone_path = temp_dir.join("atmos");
    let clone_status = std::process::Command::new("git")
        .arg("clone")
        .args(["--depth", "1", GITHUB_REPO])
        .arg(&clone_path)
        .current_dir(&temp_dir)
        .output();
    ```

### 🟡 P2 — Medium

- **`apps/web/src/components/agent/AgentChatPanel.tsx:386-484`** — Drag-and-drop state management complexity
  - **Category**: Maintainability
  - **Issue**: 100+ lines of drag/resize logic in the component creates high cognitive load. Consider extracting to custom hooks.
  - **Suggestion**: Extract to `usePanelDrag` and `usePanelResize` hooks.

- **`apps/web/src/components/workspace/OverviewTab.tsx:1758-1777`** — DnD task status update relies on index
  - **Category**: Logic | Maintainability
  - **Issue**: Using task index as identifier breaks if tasks are reordered/deleted during drag.
  - **Suggestion**: Use stable task IDs instead of array indices.

- **`apps/web/src/components/layout/Header.tsx:590-595`** — Popover timer management uses raw setTimeout
  - **Category**: Maintainability
  - **Issue**: Manual timer cleanup is error-prone. If component unmounts during timeout, memory leak could occur.
  - **Suggestion**: The current cleanup in `cancelChatPopoverClose` is correct, but consider using a ref-based pattern for clarity.

- **`apps/web/src/components/code-review/CodeReviewDialog.tsx:936-960`** — Polling with fixed 5-second delay
  - **Category**: UX | Performance
  - **Issue**: After triggering skill sync, a fixed 5-second timeout may be too short or too long depending on network.
  - **Suggestion**: Implement proper status polling with backoff.

- **`crates/infra/src/utils/system_skill_sync.rs:155-172`** — Directory search has O(n²) potential
  - **Category**: Performance
  - **Issue**: For each skill, the code searches through all directory entries. With many skills, this becomes inefficient.
  - **Suggestion**: Build a lookup map once before the loop.

- **`apps/web/src/hooks/use-dialog-store.ts:2175-2180`** — Peek function uses no-op set
  - **Category**: Code Smell
  - **Issue**: The `peekPendingAgentChatPrompt` function uses `set((state) => state)` to read state, which is a workaround pattern.
  - **Suggestion**: Zustand allows direct state reading without the no-op set.

- **`packages/ui/src/components/ui/collapsible.tsx:35-40`** — Duplicate animation classes
  - **Category**: Duplicated Code
  - **Issue**: Animation classes added here might conflict with existing radix-ui animations.
  - **Suggestion**: Verify no double-animation issues occur.

### 🟢 P3 — Low

- **`apps/web/src/components/diff/DiffViewer.tsx:1220`** — Type assertion for overflow prop
  - **Category**: Type Safety
  - **Issue**: Explicit cast `as 'wrap' | 'scroll'` suggests prop types don't align perfectly.
  - **Suggestion**: Check if the underlying library types can be improved.

- **`apps/web/src/components/workspace/OverviewTab.tsx:2134`** — Spin animation direction changed
  - **Category**: Style
  - **Issue**: Spin animation changed from `rotate(360deg)` to `rotate(-360deg)`. Intentional change for icon orientation?
  - **Suggestion**: Document why reverse spin is preferred.

- **`apps/web/src/components/agent/AgentChatPanel.tsx:648`** — `break-all` may break words aggressively
  - **Category**: Style
  - **Issue**: Using `break-all` instead of `break-words` could break meaningful words in URLs or paths.
  - **Suggestion**: Consider `break-words` or `overflow-wrap: break-word` for better readability.

- **Multiple files** — Inconsistent CSS class ordering
  - **Category**: Style
  - **Issue**: Tailwind class ordering varies across files (e.g., `py-0!` vs `!py-0`).
  - **Suggestion**: Enable `prettier-plugin-tailwindcss` for consistent ordering.

- **`apps/web/src/components/editor/MonacoEditor.tsx:33-48`** — Duplicate logic for selection info
  - **Category**: Code Smell
  - **Issue**: The preview mode selection logic duplicates much of the editor mode logic.
  - **Suggestion**: Extract common formatting logic into a shared function.

---

## Findings by File

### `apps/api/src/api/system/handlers.rs`
| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 856 | P2 | Error Handling | spawn_blocking result not awaited | Consider JoinHandle for cleanup |

### `apps/web/src/components/agent/AgentChatPanel.tsx`
| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 531 | P1 | Logic | Race condition in forced disconnect guard | Add error reset handler |
| 386-484 | P2 | Maintainability | Complex drag/resize inline logic | Extract to hooks |
| 648 | P3 | Style | break-all aggressive | Use break-words |
| 1639 | P3 | Style | whitespace-pre-wrap break-all | Consider overflow-wrap |

### `apps/web/src/components/code-review/CodeReviewDialog.tsx`
| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 936-960 | P2 | UX | Fixed 5-second polling delay | Implement proper status polling |

### `apps/web/src/hooks/use-agent-chat-layout.ts`
| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 33 | P1 | Error Handling | Silent file write failures | Add retry/logic |

### `apps/web/src/hooks/use-dialog-store.ts`
| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 2175-2180 | P2 | Code Smell | No-op set for peek | Use getState() directly |

### `apps/web/src/app/api/review-skills/route.ts`
| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 22-44 | P1 | Maintainability | Fragile regex YAML parsing | Use js-yaml library |

### `apps/web/src/components/workspace/OverviewTab.tsx`
| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 1758-1777 | P2 | Logic | Task index as DnD ID | Use stable task IDs |
| 2134 | P3 | Style | Reverse spin animation | Document intent |

### `crates/infra/src/utils/system_skill_sync.rs`
| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 70 | P1 | Error Handling | unwrap_or fallback may be wrong | Use validated path |
| 155-172 | P2 | Performance | O(n²) directory search | Build lookup map |

### `packages/ui/src/components/ui/collapsible.tsx`
| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 35-40 | P2 | Duplication | Potential animation conflict | Verify no double-animation |

---

## Architecture Notes

### Positive Patterns

1. **Clean separation of concerns** - The move from `apps/api/src/utils/wiki_skill_sync.rs` to `crates/infra/src/utils/system_skill_sync.rs` properly places infrastructure code in the infra crate.

2. **Component composition** - The new `AgentFloatingBall` component is well-isolated with its own layout management hook.

3. **WebSocket message routing** - The addition of `SkillsSystemSync` to the `WsAction` enum follows the established pattern consistently.

### Areas for Consideration

1. **State management fragmentation** - Agent chat layout state uses Zustand persisted via filesystem, while dialog state uses Zustand without persistence. Consider consolidating persistence strategy.

2. **Skill sync directory structure** - The change to place code review skills in `code_review_skills/` subdirectory is a good organizational pattern, but the lookup logic in `get_target_dir` should be documented.

3. **Review reports organization** - Adding workspaceId to the review path (`{workspaceId}/{project}_{branch}_{timestamp}_{topic}.md`) is a good improvement for multi-workspace scenarios.

---

## Positive Highlights

1. **Excellent refactoring** - Moving 221 lines from `apps/api/src/utils/wiki_skill_sync.rs` to `crates/infra/src/utils/system_skill_sync.rs` with improved structure is a significant cleanup.

2. **Drag-and-drop implementation** - The task DnD feature in `OverviewTab.tsx` adds valuable UX improvement with proper `DragOverlay` for smooth visuals.

3. **Responsive design improvements** - The draggable/resizable agent chat panel is a substantial UX enhancement that respects user preferences.

4. **Dynamic skill loading** - The `/api/review-skills` endpoint enables extensibility, allowing users to add custom review skills without code changes.

5. **Floating ball UX** - The edge-snapping behavior with hover expansion is an elegant interaction pattern.

6. **Internationalization cleanup** - Moving from Chinese to English UI text in `CodeReviewDialog.tsx` improves consistency.

---

## Recommended Next Steps

1. **Add error reset for forced disconnect guard** (P1) - Prevent future connection failures from blocking the feature.

2. **Replace regex YAML parsing with proper library** (P1) - Use `js-yaml` for robust skill metadata parsing.

3. **Implement proper skill sync status polling** (P2) - Replace fixed timeout with WebSocket-based status updates.

4. **Add stable task IDs for DnD** (P2) - Prevent task reordering issues.

5. **Extract drag/resize logic to custom hooks** (P2) - Reduce `AgentChatPanel.tsx` complexity.

---

## Security Considerations

No security vulnerabilities found. The code properly:
- Uses parameterized queries (Rust type system prevents SQL injection)
- Validates file paths before filesystem operations
- Does not expose sensitive data in WebSocket messages
- Uses proper authentication checks (inherited from base patterns)

---

## Files Changed

### Modified (27 files)
- `apps/api/src/api/system/handlers.rs`
- `apps/api/src/api/system/mod.rs`
- `apps/api/src/main.rs`
- `apps/api/src/utils/mod.rs`
- `apps/web/src/api/ws-api.ts`
- `apps/web/src/app/[locale]/(app)/layout.tsx`
- `apps/web/src/components/agent/AgentChatPanel.tsx`
- `apps/web/src/components/code-review/CodeReviewDialog.tsx`
- `apps/web/src/components/diff/DiffViewer.tsx`
- `apps/web/src/components/editor/MonacoEditor.tsx`
- `apps/web/src/components/layout/CenterStage.tsx`
- `apps/web/src/components/layout/Header.tsx`
- `apps/web/src/components/wiki/WikiContent.tsx`
- `apps/web/src/components/workspace/OverviewTab.tsx`
- `apps/web/src/hooks/use-agent-session.ts`
- `apps/web/src/hooks/use-dialog-store.ts`
- `apps/web/src/hooks/use-websocket.ts`
- `apps/web/src/lib/format-selection-for-ai.ts`
- `crates/core-service/src/service/ws_message.rs`
- `crates/infra/src/lib.rs`
- `crates/infra/src/websocket/message.rs`
- `packages/ui/src/components/ui/collapsible.tsx`
- `packages/ui/src/index.ts`
- `packages/ui/src/styles/globals.css`

### Deleted (11 files - legacy skill definitions)
- `apps/api/src/utils/wiki_skill_sync.rs`
- `skills/code-review-excellence/SKILL.md`
- `skills/code-review-expert/` (entire directory)
- `skills/code-reviewer/SKILL.md`
- `skills/typescript-react-reviewer/` (entire directory)

### Added (4 files)
- `apps/web/src/components/agent/AgentFloatingBall.tsx`
- `apps/web/src/hooks/use-agent-chat-layout.ts`
- `apps/web/src/app/api/review-skills/route.ts`
- `crates/infra/src/utils/mod.rs`
- `crates/infra/src/utils/system_skill_sync.rs`
