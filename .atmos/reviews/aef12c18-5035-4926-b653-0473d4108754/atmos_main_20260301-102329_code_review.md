# Code Review Report

| Entry | Details |
| :--- | :--- |
| **Date** | 2026-03-01 10:23 |
| **Reviewer** | AI (fullstack-reviewer) |
| **Scope** | Git diff (unstaged changes) — 14 files modified, +520/-203 lines |
| **Project Stack** | Rust + Axum + Sea-ORM / TypeScript + React 19 + Next.js + Framer Motion |
| **Overall Assessment** | **REQUEST_CHANGES** |

---

## Summary

| Metric | Value |
|--------|-------|
| Files Reviewed | 14 |
| Lines Changed | +520 / -203 |
| P0 (Critical) | 0 |
| P1 (High) | 8 |
| P2 (Medium) | 12 |
| P3 (Low) | 6 |

---

## Findings by Severity

### 🔴 P0 — Critical
> None found. ✅

### 🟠 P1 — High

- **`crates/core-service/src/service/agent_session.rs:628-639`** — Race condition in temp directory deletion
  - **Category**: Security | Race Condition
  - **Issue**: The code checks if a path exists with `temp_path.exists()` and then immediately deletes it. Between the check and delete, another process could delete the directory or create a symlink, leading to a TOCTOU (time-of-check-time-of-use) vulnerability. Additionally, `remove_dir_all` on a user-controlled path is dangerous.
  - **Suggestion**: Validate the path is within a trusted temp directory before deletion, and remove the exists() check since remove_dir_all will fail appropriately if the path doesn't exist.
    ```rust
    // Validate path is within allowed temp directory first
    let allowed_temp_base = PathBuf::from("/var/atmos/temp"); // or config value
    let canonical_path = temp_path.canonicalize().unwrap_or_else(|_| temp_path.clone());
    if !canonical_path.starts_with(&allowed_temp_base) {
        return Err(ServiceError::BadRequest("Invalid temp directory path".to_string()));
    }

    // Remove exists() check - remove_dir_all handles this
    if let Err(e) = std::fs::remove_dir_all(&temp_path) {
        tracing::warn!("Failed to delete temp session directory {}: {}", temp_path.display(), e);
    }
    ```

- **`apps/web/src/components/chat-sessions/ChatSessionsManagementView.tsx:297`** — Missing authorization check for session deletion
  - **Category**: Security | Authorization
  - **Issue**: The `handleDeleteSession` function does not verify that the current user has permission to delete the session. Any authenticated user could potentially delete sessions they don't own (IDOR vulnerability).
  - **Suggestion**: Ensure the backend `deleteSession` endpoint validates ownership. Add explicit ownership check in the UI layer as defense-in-depth:
    ```typescript
    const handleDeleteSession = async (session: EnrichedSession, e: React.MouseEvent) => {
        e.stopPropagation();

        // Verify ownership before deleting
        if (!session.isOwner && !session.isShared) {
            toastManager.add({ message: "You don't have permission to delete this session", type: "error" });
            return;
        }
        // ... rest of the function
    ```

- **`apps/web/src/components/agent/AgentChatPanel.tsx:1983-1999`** — WebSocket race condition in pending prompt handling
  - **Category**: Logic | Race Condition
  - **Issue**: The code tries to send a prompt via WebSocket, and if sending fails (`!sent`), it restores the prompt. However, between the `sendPrompt` call and the `setPendingAgentChatPrompt` restoration, another effect could consume the prompt, leading to lost prompts or duplicate sends.
  - **Suggestion**: Use a ref to track the pending prompt state atomically, or restructure to avoid the race:
    ```typescript
    const pendingPromptRef = useRef(pendingAgentChatPrompt);
    useEffect(() => { pendingPromptRef.current = pendingAgentChatPrompt; }, [pendingAgentChatPrompt]);

    // In the effect:
    const sent = sendPrompt(data.prompt);
    if (!sent) {
        // Restore only if the current pending prompt matches what we tried to send
        if (pendingPromptRef.current === data) {
            setPendingAgentChatPrompt(data);
        }
        return;
    }
    ```

- **`apps/web/src/components/agent/AgentChatPanel.tsx:1672-1708`** — Duplicate DB query for session resume
  - **Category**: Performance | Architecture
  - **Issue**: The `chatMode` change effect queries `listSessions({ limit: 1 })` to get the latest session, and the `isAgentChatOpen` effect also queries `listSessions` with similar parameters. This causes duplicate API calls when opening chat panel after a mode switch.
  - **Suggestion**: Consolidate the resume logic into a single effect that handles both cases, or cache the result of the first query to avoid the duplicate call.

- **`crates/infra/src/db/repo/agent_chat_session_repo.rs:210-217`** — Missing transaction for soft delete with side effects
  - **Category**: Architecture | Data Consistency
  - **Issue**: The `soft_delete` method performs a database update but the caller (in `agent_session.rs`) also performs file system operations. If the DB update succeeds but file deletion fails (or vice versa), the system is left in an inconsistent state. The operations should be wrapped in a transactional pattern.
  - **Suggestion**: Either wrap both operations in a compensating transaction pattern, or make the file deletion idempotent and async. Consider implementing a "marked for deletion" pattern with a cleanup job.

- **`apps/web/src/hooks/use-agent-session.ts:208-215`** — sendPrompt return value inconsistent with WebSocket state
  - **Category**: Logic | Error Handling
  - **Issue**: The function returns `true` if `wsRef.current?.readyState === WebSocket.OPEN`, but the send could still fail asynchronously. The return value gives a false sense of reliability. Additionally, the `send()` call itself could throw an exception that isn't caught.
  - **Suggestion**: Either make the send truly synchronous/reliable, or change the return type to indicate it's a best-effort check:
    ```typescript
    const sendPrompt = useCallback((message: string): boolean => {
        try {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "prompt", message }));
                return true;
            }
            return false;
        } catch (e) {
            console.error('WebSocket send error:', e);
            return false;
        }
    }, []);
    ```

- **`apps/web/src/components/agent/AgentChatPanel.tsx:1335-1347`** — Wiki context switch doesn't notify user
  - **Category**: UX | Logic
  - **Issue**: When a user is in a workspace and switches to wiki_ask mode, the `sessionProjectId` and `sessionWorkspaceId` are silently changed to point to the parent project. The user might not realize their session context has changed, potentially leading to confusion about which files the agent can access.
  - **Suggestion**: Add a visible indicator or toast notification when the context switches:
    ```typescript
    useEffect(() => {
        if (chatMode === "wiki_ask" && workspaceId && parentProjectId && sessionId) {
            // Only notify on first switch
            toastManager.add({
                message: "Wiki sessions are scoped to the parent project directory",
                type: "info",
                duration: 5000,
            });
        }
    }, [chatMode]);
    ```

- **`apps/api/src/api/agent/handlers.rs:360-367`** — No authorization check on delete endpoint
  - **Category**: Security | Authorization
  - **Issue**: The `delete_agent_session` handler doesn't verify that the requesting user owns the session being deleted. The session_id comes from the URL path and is passed directly to the service layer.
  - **Suggestion**: Verify ownership before deletion:
    ```rust
    pub async fn delete_agent_session(
        Path(session_id): Path<String>,
        State(state): State<AppState>,
        // Assuming authentication middleware injects user info
        auth_user: AuthUser, // Add this parameter
    ) -> ApiResult<Json<ApiResponse<Value>>> {
        // First verify ownership
        let session = state.agent_session_service
            .get_session_for_user(&session_id, &auth_user.id)
            .await?;

        if session.is_none() {
            return Ok(Json(ApiResponse::error("Session not found or access denied")));
        }

        // Proceed with deletion
        let temp_cwd = state.agent_session_service.delete_session(&session_id).await?;
        // ...
    }
    ```

### 🟡 P2 — Medium

- **`apps/web/src/components/chat-sessions/ChatSessionsManagementView.tsx:97-108`** — Stale data in registry agents loading
  - **Category**: Maintainability | Data Freshness
  - **Issue**: Registry agents are loaded once on mount and never refreshed. If new agents are added while the view is open, they won't appear until the page is refreshed.
  - **Suggestion**: Either add a refresh button, use React Query with automatic refetching, or listen for agent registry change events.

- **`apps/web/src/components/chat-sessions/ChatSessionsManagementView.tsx:279-298`** — No confirmation for destructive action
  - **Category**: UX | Error Prevention
  - **Issue**: The delete action has no confirmation dialog. A misclick could permanently delete a session.
  - **Suggestion**: Add a confirmation dialog:
    ```typescript
    const handleDeleteSession = async (session: EnrichedSession, e: React.MouseEvent) => {
        e.stopPropagation();

        if (!confirm(`Delete session "${session.title || 'Untitled'}"? This action cannot be undone.`)) {
            return;
        }
        // ... rest of deletion logic
    ```

- **`apps/web/src/components/agent/AgentChatPanel.tsx:1302-1322`** — Removed localStorage code leaves stale data
  - **Category**: Maintainability | Migration
  - **Issue**: The code removes the localStorage session mapping logic, but existing users may have stale data in `localStorage.getItem('atmos.agent.last_session_by_context')` that will never be cleaned up.
  - **Suggestion**: Add a migration effect to clear the old key on first load:
    ```typescript
    useEffect(() => {
        const OLD_KEY = "atmos.agent.last_session_by_context";
        const CLEANED_KEY = "atmos.agent.migrated_last_session_v2";
        const alreadyCleaned = localStorage.getItem(CLEANED_KEY);
        if (!alreadyCleaned) {
            localStorage.removeItem(OLD_KEY);
            localStorage.setItem(CLEANED_KEY, "true");
        }
    }, []);
    ```

- **`apps/web/src/components/agent/AgentChatPanel.tsx:2089-2098`** — Timestamp format duplicated across codebase
  - **Category**: Maintainability | Code Duplication
  - **Issue**: The timestamp format `YYYY-MM-DD_HH:mm` is manually constructed in multiple places (wiki_ask title, code review, git commit). This is error-prone and inconsistent.
  - **Suggestion**: Extract to a shared utility function:
    ```typescript
    // In @atmos/shared or similar
    export function formatTimestampForTitle(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");
        return `${year}-${month}_${day}_${hours}:${minutes}`;
    }
    ```

- **`apps/web/src/components/agent/AgentChatPanel.tsx:1602-1651`** — Complex session resume logic hard to follow
  - **Category**: Maintainability | Code Complexity
  - **Issue**: The `chatMode` change effect contains deeply nested async logic for session restoration with multiple error handling paths. This makes debugging difficult.
  - **Suggestion**: Extract the resume logic into a separate function:
    ```typescript
    const resumeLatestSession = useCallback(async (contextType: string, contextGuid: string | undefined, mode: AgentChatMode) => {
        try {
            const res = await agentRestApi.listSessions({
                context_type: contextType,
                context_guid: contextGuid,
                mode,
                limit: 1,
            });
            const latestSession = res.items[0];
            if (latestSession) {
                await resumeSession(latestSession.guid);
                return true;
            }
            return false;
        } catch (e) {
            console.error("Failed to resume session:", e);
            return false;
        }
    }, [resumeSession]);

    // Then in the effect:
    const resumed = await resumeLatestSession(contextType, contextGuid, chatMode);
    if (!resumed) {
        startSession();
    }
    ```

- **`apps/web/src/components/chat-sessions/ChatSessionsManagementView.tsx:553-576`** — RTL hack for path truncation
  - **Category**: Maintainability | CSS
  - **Issue**: Using `dir="rtl"` to truncate paths from the left is a clever CSS trick but may cause issues with RTL languages and accessibility.
  - **Suggestion**: Use a proper CSS solution with `text-overflow: ellipsis` and `direction: rtl` specifically scoped, or use JavaScript to truncate paths properly:
    ```typescript
    const truncatePath = (path: string | null, maxLen = 30): string => {
        if (!path) return '-';
        if (path.length <= maxLen) return path;
        return '...' + path.slice(-(maxLen - 3));
    };
    ```

- **`apps/web/src/components/agent/AgentManagerView.tsx:608-633`** — Unnecessary AnimatePresence for icon swap
  - **Category**: Performance | Rendering
  - **Issue**: Using `AnimatePresence` with `mode="wait"` for a simple icon swap is overkill. The exit animation blocks the enter animation, making the transition feel sluggish.
  - **Suggestion**: Use a simpler animation without AnimatePresence, or use `layout` prop for smoother transitions:
    ```tsx
    <motion.div
        key={iconHovered ? "hover" : "default"}
                        className="absolute inset-0 flex items-center justify-center"
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        initial={{ y: 12, opacity: 0, scale: 0.85 }}
                        transition={{ duration: 0.2 }}
    >
        {iconHovered ? <Bot /> : <MessageSquare />}
    </motion.div>
    ```

- **`apps/web/src/components/layout/RightSidebar.tsx:550-555`** — Context name extraction fragile
  - **Category**: Maintainability | Error Handling
  - **Issue**: `currentWorkspace?.localPath?.split("/").pop()` could return `undefined` if the path is empty or malformed, leading to session titles like `undefined_GitCommit_...`.
  - **Suggestion**: Add fallback handling:
    ```typescript
    const contextName = currentWorkspace?.localPath?.split("/").filter(Boolean).pop()
        ?? currentProject?.name
        ?? "Project";
    ```

- **`apps/web/src/components/code-review/CodeReviewDialog.tsx:307-310`** — Redundant mode setting
  - **Category**: Maintainability | Logic
  - **Issue**: The code sets `setPendingAgentChatMode("default")` which is likely already the default mode. This is unnecessary and suggests the mode handling might be overcomplicated.
  - **Suggestion**: Either remove this line if "default" is the default, or document why it's necessary to explicitly set the mode.

- **`apps/web/src/components/agent/AgentChatPanel.tsx:2442-2462`** — Chat history popover header adds cognitive load
  - **Category**: UX | Maintainability
  - **Issue**: The context tooltip in the history popover header adds complexity without proportional value. Users who understand the context already know it, and those who don't might not check the tooltip.
  - **Suggestion**: Consider a more prominent indicator or remove it entirely if the context is clear from the page. The current implementation adds significant JSX complexity for minimal UX benefit.

- **`crates/core-service/src/service/agent_session.rs:631`** — Manual string comparison for context type
  - **Category**: Maintainability | Type Safety
  - **Issue**: `m.context_type == "temp"` is a string comparison that could be typo-prone and doesn't benefit from Rust's type system.
  - **Suggestion**: Use an enum for context types:
    ```rust
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub enum ContextType {
        Workspace,
        Project,
        Temp,
    }

    impl FromStr for ContextType {
        type Err = ServiceError;
        fn from_str(s: &str) -> Result<Self, Self::Err> {
            match s {
                "workspace" => Ok(ContextType::Workspace),
                "project" => Ok(ContextType::Project),
                "temp" => Ok(ContextType::Temp),
                _ => Err(ServiceError::BadRequest(format!("Invalid context type: {}", s))),
            }
        }
    }
    ```

- **`apps/web/src/components/chat-sessions/ChatSessionsManagementView.tsx:350-352`** — SelectTrigger width hardcoded
  - **Category**: Maintainability | UI
  - **Issue**: The SelectTrigger width is increased to 160px, but if more agents are added with longer names, this could cause layout issues.
  - **Suggestion**: Use `min-w-[160px]` or `w-auto` with a max-width constraint to handle variable content better.

### 🟢 P3 — Low

- **`apps/web/src/components/agent/AgentChatPanel.tsx:2393-2402`** — Icon swap animation duration too fast
  - **Category**: UX | Animation
  - **Issue**: The 150ms duration for the icon swap animation might be too subtle for users to notice.
  - **Suggestion**: Consider 200ms-250ms for more noticeable feedback, or remove the animation entirely if it's purely decorative.

- **`apps/web/src/components/agent/AgentChatPanel.tsx:2069`** — Magic number for title truncation
  - **Category**: Style | Maintainability
  - **Issue**: `text.slice(0, 512)` uses a magic number for the title length limit.
  - **Suggestion**: Extract to a named constant:
    ```typescript
    const MAX_SESSION_TITLE_LENGTH = 512;
    const title = text.slice(0, MAX_SESSION_TITLE_LENGTH).trim() || "新会话";
    ```

- **`apps/api/src/api/agent/handlers.rs:361`** — temp_cwd naming inconsistency
  - **Category**: Style | Naming
  - **Issue**: The variable is named `temp_cwd` but could be `None` even for temp sessions (if deletion already happened). A more accurate name would be `deleted_temp_cwd` or `temp_dir_to_cleanup`.
  - **Suggestion**: Rename for clarity or add documentation about when this value is populated.

- **`apps/web/src/components/layout/RightSidebar.tsx:754-756`** — Inline `span` for tab text
  - **Category**: Style | Consistency
  - **Issue**: Wrapping tab text in a `<span className="text-xs">` is inconsistent with other tab implementations in the codebase.
  - **Suggestion**: Either apply this pattern consistently across all tabs, or adjust the base TabsTab component to handle text sizing.

- **`apps/web/src/components/agent/AgentChatPanel.tsx:1111`** — Trailing whitespace in removed code
  - **Category**: Style | Formatting
  - **Issue**: The diff shows removed code with trailing whitespace (line 231 `const LAST_SESSION_STORAGE_KEY = "atmos.agent.last_session_by_context";`).
  - **Suggestion**: Enable pre-commit hooks to catch trailing whitespace automatically.

- **`specs/tech/ATMOS 本地智能 Agent 集成方案.md:556-603`** — Bugfix section in design doc
  - **Category**: Documentation | Organization
  - **Issue**: The spec document contains a detailed bugfix section which is more appropriate for a CHANGELOG, release notes, or a separate bugfix analysis document.
  - **Suggestion**: Consider moving this content to a dedicated bugfix report or keeping design docs focused on architecture and future plans rather than historical bug fixes.

---

## Findings by File

### `apps/api/src/api/agent/handlers.rs`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 360-367 | P1 | Security | Missing authorization check for delete endpoint | Add ownership verification before deletion |
| 365 | P3 | Naming | `temp_cwd` naming unclear | Rename to `deleted_temp_cwd` or add docs |

### `apps/api/src/api/agent/mod.rs`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 31-32 | P3 | Style | Extra spaces in import | Remove extra whitespace |

### `crates/core-service/src/service/agent_session.rs`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 628-639 | P1 | Security/Performance | TOCTOU vulnerability in path deletion + race condition | Validate path bounds, remove exists() check |
| 631 | P2 | Type Safety | String comparison for context type | Use enum for context types |
| 640-644 | P2 | Architecture | No transaction between DB and FS operations | Use compensating transaction pattern |

### `crates/infra/src/db/repo/agent_chat_session_repo.rs`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 210-217 | P1 | Architecture | Soft delete not transactional with side effects | Wrap operations in compensating pattern |

### `apps/web/src/api/rest-api.ts`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 432-442 | P2 | Type Safety | Return type not validated at runtime | Consider runtime validation |

### `apps/web/src/hooks/use-agent-session.ts`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 208-215 | P1 | Logic/Error Handling | sendPrompt return value misleading | Add try-catch, document as best-effort |

### `apps/web/src/hooks/use-dialog-store.ts`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 27-30 | P2 | Maintainability | Type definition duplicated | Extract to shared interface |

### `apps/web/src/components/agent/AgentChatPanel.tsx`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 231 | P3 | Style | Trailing whitespace in removed code | Enable pre-commit formatting |
| 1302-1322 | P2 | Migration | Stale localStorage data not cleaned | Add migration cleanup effect |
| 1329-1337 | P2 | Logic | Parent project resolution not cached | Memo is already present, OK |
| 1337-1347 | P1 | UX | Wiki context switch not user-visible | Add notification on context switch |
| 1602-1651 | P2 | Complexity | Session resume logic deeply nested | Extract to separate function |
| 1672-1708 | P1 | Performance | Duplicate DB query for resume | Consolidate resume logic |
| 1858 | P2 | Logic | No error handling for resume failure | Already handled in the async block |
| 1983-1999 | P1 | Race Condition | WebSocket prompt handling has race | Use ref for atomic check |
| 2069 | P3 | Style | Magic number 512 for title length | Use named constant |
| 2089-2098 | P2 | Duplication | Timestamp format duplicated | Extract to utility |
| 2393-2402 | P3 | UX | Icon animation duration too fast | Increase to 200-250ms |
| 2442-2462 | P2 | UX/Complexity | Context tooltip adds complexity | Consider more prominent indicator |

### `apps/web/src/components/agent/AgentManagerView.tsx`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 608-633 | P2 | Performance | AnimatePresence overkill for icon swap | Use simpler animation without mode="wait" |

### `apps/web/src/components/chat-sessions/ChatSessionsManagementView.tsx`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 97-108 | P2 | Data Freshness | Registry agents never refreshed | Add refresh mechanism |
| 279-298 | P1 | Security | No authorization check for delete | Verify ownership before deletion |
| 279-298 | P2 | UX | No confirmation for delete action | Add confirmation dialog |
| 350-352 | P3 | UI | SelectTrigger width hardcoded | Use min-width instead |
| 553-576 | P2 | CSS/Maintainability | RTL hack for path truncation | Use proper CSS or JS truncation |
| 562-567 | P1 | Logic | Context key calculation duplicates AgentChatPanel logic | Extract to shared utility |

### `apps/web/src/components/code-review/CodeReviewDialog.tsx`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 307-310 | P2 | Logic | Redundant mode setting | Remove if unnecessary |
| 307-310 | P2 | Duplication | Timestamp format duplicated | Extract to utility |

### `apps/web/src/components/github/PRPanel.tsx`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 47-50 | P3 | Consistency | Inconsistent tab text styling | Use consistent pattern |

### `apps/web/src/components/layout/RightSidebar.tsx`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 550-555 | P2 | Error Handling | Context name extraction fragile | Add fallback for undefined |
| 754-756 | P3 | Consistency | Inline span for tab text | Apply consistently |

---

## Architecture Notes

### Positive Architecture Decisions

1. **Clear Separation of Concerns**: The bug fix properly identifies the root cause (localStorage race conditions) and implements a targeted solution (DB-based session recovery).

2. **Context-Aware Session Management**: The decision to scope wiki_ask sessions to the parent project when in a workspace context is architecturally sound — it correctly identifies that wiki data lives in the project directory, not workspace worktrees.

3. **Soft Delete Pattern**: Implementing soft delete for sessions is a good practice for data recovery and audit trails.

### Areas for Improvement

1. **Coupling Between Frontend Context Calculation**: The logic for calculating `sessionWorkspaceId` and `sessionProjectId` based on `chatMode` is duplicated between `AgentChatPanel.tsx` and `ChatSessionsManagementView.tsx`. This should be extracted to a shared utility.

2. **Missing Event-Driven Architecture**: The registry agents loading and session management would benefit from an event-driven pattern (e.g., using React Query's cache invalidation or a custom event bus) rather than manual refetching.

3. **Inconsistent Error Handling**: Some async operations use try-catch with logging, others silently fail. Establish a consistent error handling pattern across the codebase.

4. **Type Safety Gaps**: The backend uses string literals for context types (`"temp"`, `"workspace"`, `"project"`) instead of enums, reducing type safety.

---

## Positive Highlights

1. **Comprehensive Bug Documentation**: The spec document includes an excellent bugfix analysis section that clearly identifies the problem, root cause, solution, and affected files. This level of documentation is exemplary.

2. **Clean Removal of Dead Code**: The localStorage session mapping functions (`readLastSessionMap`, `getLastSessionIdForContext`, `setLastSessionIdForContext`, `clearLastSessionIdForContext`) are cleanly removed when the DB-based approach is implemented. No unused code is left behind.

3. **Thoughtful Session Naming**: The addition of structured session titles (`{ProjectName}_WikiAsk_{timestamp}`, `{ProjectName}_CodeReview_{timestamp}`) improves the user experience by making sessions easily identifiable.

4. **Proper use of React hooks**: Despite the complexity, the code correctly follows React's Rules of Hooks — no conditional hook calls, proper dependency arrays.

5. **Improved UX in Session Management**: The hover-to-reveal actions (open/delete) in the session list is a nice interaction pattern that reduces visual clutter while maintaining functionality.

6. **Database-First Approach**: Switching from localStorage to database queries for session recovery is the correct architectural decision — it's more reliable and doesn't suffer from cross-tab consistency issues.

---

## Recommended Next Steps

1. **Block on P1 Security Issues**: Address the authorization checks in both frontend (`handleDeleteSession`) and backend (`delete_agent_session` handler) before merging.

2. **Fix Race Condition**: Address the TOCTOU vulnerability in temp directory deletion and the WebSocket prompt handling race condition.

3. **Add Migration for Old Data**: Implement a one-time cleanup of the deprecated `atmos.agent.last_session_by_context` localStorage key.

4. **Extract Shared Utilities**: Create shared utilities for:
   - Timestamp formatting (`formatTimestampForTitle()`)
   - Context key calculation (`getSessionContextKey()` is already extracted, but ensure it's used everywhere)
   - Session resume logic

5. **Add Session Delete Confirmation**: Implement a confirmation dialog for the destructive delete action.

6. **Consider Adding Integration Tests**: The session resume logic is complex and would benefit from automated testing covering:
   - Mode switching with existing sessions
   - Page refresh and session restoration
   - Wiki context in workspace vs project

7. **Document Context Switching Behavior**: Add user-facing documentation or tooltip explaining why wiki sessions use project context when in a workspace.
