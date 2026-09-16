# TECH · APP-074: CodeMirror Git Blame Hover

> Technical Design · HOW. Implements PRD APP-074: CodeMirror Git Blame Hover. Addresses **M1–M8**. **N1–N7 deferred**.

## Scope summary

Add first-party **line git blame** to the CodeMirror Source file tab: one per-file WS blame (range-coalesced), a **two-layer cache** (whole-file ranges + lazy per-SHA stats — not an LRU of N recent commits), a current-line end-of-line widget, a hover card, skip/uncommitted handling, and a **default-on** `editor.git_blame` function-settings key wired into the existing header gear and Settings → Editor.

Does **not** add REST, a third-party CodeMirror plugin, file-wide annotate, Live markdown blame, or changes to the git change gutter (`gitIntegration` / `codemirror-git-gutter.ts`).

## Architecture overview

```
apps/web  CodeMirror Source tab
  BaseCodeMirrorEditor + git-blame Compartment
  hoverTooltip + current-line WidgetType
  useEditorSettingsStore.gitBlame
        │  wsRequest("git_file_blame" | "git_commit_detail")
        ▼
apps/api  WsAction::GitFileBlame / GitCommitDetail
        ▼
crates/core-engine  GitEngine::file_blame / commit_detail
        ▼
git blame --line-porcelain   git show --format --shortstat
```

No `crates/infra` schema. Persistence is the existing `function_settings.json` blob (`function_settings_update`).

```mermaid
sequenceDiagram
  participant CM as CodeMirror Source
  participant Q as TanStack Query
  participant WS as apps/api /ws
  participant GE as GitEngine
  CM->>Q: open or focus file.ts
  Q->>WS: git_file_blame once for this file
  WS->>GE: cache miss on blob fingerprint
  GE->>GE: blame --line-porcelain
  GE-->>WS: ranges + commit summaries + blob_id
  WS-->>Q: GitFileBlameResponse
  Note over CM,Q: caret/hover other lines in file.ts: range lookup only
  CM->>CM: end-of-line widget (M1)
  CM->>Q: first hover of SHA aaa
  Q->>WS: git_commit_detail aaa
  WS->>GE: show --format --shortstat
  GE-->>Q: body + files/ins/del
  Q-->>CM: fill stats on existing card (M2)
  CM->>Q: switch to other.ts
  Q->>WS: git_file_blame for other.ts
  Note over Q: file.ts blame stays until gcTime
  CM->>Q: hover SHA aaa again
  Note over Q: detail cache hit; no second git show
```

## Module-by-module design

### crates/infra

No DB. No new tables.

### crates/core-engine

Files: `crates/core-engine/src/git/blame.rs` (new), re-export from `git/mod.rs`, types in `git/types.rs`.

- `GitEngine::file_blame(repo_path, file_relative_path) -> Result<FileBlameInfo>`
  - Resolve file under repo; reject path escape.
  - Skip **before** blame when: not a git repo; path untracked (`git ls-files --error-unmatch`); binary (`git diff --numstat` / NUL in blob); size **> 1.5 MiB** (reuse `TEXT_DIFF_MAX_BYTES` from `git/changes.rs`) or **> 10_000 lines**.
  - Fingerprint first: `git hash-object -- <file>` on worktree bytes (HEAD blob if the path is gone). Look up `(canonical_repo, relpath, blob_id)`. **Hit → return the cached whole-file `FileBlameInfo`** (no `git blame`). File-entry LRU cap ~64; never evict individual commits out of a file map.
  - Miss: `git blame --line-porcelain -- <file>` (no extra `-w` in v1). Include working-tree edits so uncommitted lines appear as `0000000…` / not-a-commit in porcelain.
  - Parse porcelain; coalesce adjacent lines with the same final SHA into ranges.
  - Uncommitted / not-yet-committed porcelain SHA → `commit_hash: null` on the range; do not put a fake commit in `commits`.
  - `commits` map: unique real SHAs only, with `hash`, `short_hash` (7 or git’s abbrev), `author_name`, `author_email`, `timestamp` (unix seconds from author-time), `subject` (porcelain `summary`).
  - Store the result under `blob_id` and return it.
- `GitEngine::commit_detail(repo_path, commit_hash) -> Result<CommitDetailInfo>`
  - `git show -s --format=%B --shortstat <hash>` (or equivalent: body + `--shortstat`).
  - Parse `n files changed, a insertions(+), b deletions(-)` (files/ins/del may be 0).
  - Reject obviously non-hex hashes.
  - Optional process-local cache keyed by `(canonical_repo, commit_hash)` (small; SHA-level LRU/GC is fine here because stats are not line maps).

Do **not** run blame inside `commit_detail`. Do **not** return file contents. Do **not** cache “the last N commits in the repo.”

### crates/core-service

No new business rules. Path expansion stays in the WS layer via `FsEngine::expand_path`, same as `git_file_diff`.

### apps/api

- `WsAction::GitFileBlame` and `WsAction::GitCommitDetail` next to `GitFileDiff` / `GitHistory` in `apps/api/src/api/ws/message.rs`.
- Request/response structs in `apps/api/src/api/ws/message/git.rs`.
- Handlers in `apps/api/src/api/ws/router/git.rs`; arms in `router/mod.rs`.
- `git_file_blame` is a **skip-shaped success**, not an error, for binary / too_large / untracked (`kind` on the response). Real git failures (not a repo, git missing) stay `ServiceError::Validation` like other git actions.

### packages/api-types

Same PR as Rust (APP-048 / APP-064 recipe):

1. Extract actions → `src/ws/actions.ts` (`git_file_blame`, `git_commit_detail`).
2. DTOs in `src/ws/dto/git.ts`.
3. Rows in `src/ws/contract/git.ts`.
4. `bun run --filter @atmos/api-types test` + `check-actions`.

No Hub/Relay REST DTOs.

### apps/web

| Area | Path |
|------|------|
| Settings state | `apps/web/src/features/settings/store/editor-settings-store.ts` — `gitBlame: boolean`, default **`true`**, `setGitBlame` → `functionSettingsApi.update('editor', 'git_blame', value)` |
| Function settings type | `apps/web/src/api/ws/settings-api.ts` `editor.git_blame?: boolean` |
| Header switch | `apps/web/src/features/editor/components/CodeMirrorEditor.tsx` `renderEditorSettingsMenu` — new row after Git integration, same `Switch` + tooltip pattern |
| Settings page | `apps/web/src/features/settings/components/EditorSettingsSection.tsx` — `SettingsGroupRow` after Git integration |
| WS wrapper | `apps/web/src/api/ws-api.ts` `gitApi.getFileBlame` / `getCommitDetail` — `wsRequest("git_file_blame" \| "git_commit_detail", { ...snake })` **no** `<T>` |
| Query keys | `apps/web/src/api/query/query-keys.ts` under `computer.git(...)` — **two** keys: `gitFileBlame(scope, repo, file)` and `gitCommitDetail(scope, repo, sha)`. Hover SHA must not appear on the blame key. |
| Query hook | `apps/web/src/features/git/hooks/use-git-file-blame-query.ts` (mirror `use-git-file-diff-query.ts`) |
| Commit-detail query | `apps/web/src/features/git/hooks/use-git-commit-detail-query.ts` — `enabled` only when a hover SHA is set |
| CM extension | `apps/web/src/shared/lib/codemirror-git-blame.ts` (+ small theme helper if needed) |
| Editor wiring | `apps/web/src/features/editor/components/BaseCodeMirrorEditor.tsx` — Compartment like `gitIntegrationCompartment`; `gitBlame` + `gitDiffSource` |
| i18n | `apps/web/messages/en.json` + `zh.json` — `codeMirror.settings.gitBlame*`, `codeMirror.gitBlame.*`, `settings.editorSection.rows.gitBlame.*` |

**Do not** put blame UI in `packages/ui` (too domain-specific). Reuse `@workspace/ui` `Switch`, `Button`, `Tooltip`, `Popover` for **settings**. The in-editor card is a CodeMirror `hoverTooltip` DOM node styled with the same tokens (`bg-popover`, `text-popover-foreground`, `rounded-xl`, `shadow-md`, `p-3`), **not** a Radix `Popover` (focus/hover fight with CM). Copy control: same inline Check/Copy pattern as `HashCopyButton` in `apps/web/src/features/github/components/CommitList.tsx` — **no success toast**.

### packages/ui

No new primitive. If a copy-icon button is extracted, it is optional and not required to ship.

## Data model

```rust
pub enum FileBlameKind {
    Ok,
    Binary,
    TooLarge,
    Untracked,
}

pub struct BlameRange {
    pub start_line: u32, // 1-based inclusive
    pub end_line: u32,   // 1-based inclusive
    pub commit_hash: Option<String>, // None = uncommitted
}

pub struct BlameCommit {
    pub hash: String,
    pub short_hash: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub subject: String,
}

pub struct FileBlameInfo {
    pub file_path: String,
    /// Worktree `git hash-object` (or HEAD blob if unreadable). Cache identity for this file only.
    pub blob_id: Option<String>,
    pub kind: FileBlameKind,
    pub ranges: Vec<BlameRange>,
    pub commits: HashMap<String, BlameCommit>,
}

pub struct CommitDetailInfo {
    pub hash: String,
    pub body: Option<String>, // rest of %B after subject; None if empty
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
}
```

Wire JSON (snake_case, serde-identical):

```ts
export type GitFileBlameKind = "ok" | "binary" | "too_large" | "untracked";

export type GitBlameRange = {
  start_line: number;
  end_line: number;
  commit_hash: string | null;
};

export type GitBlameCommit = {
  hash: string;
  short_hash: string;
  author_name: string;
  author_email: string;
  timestamp: number;
  subject: string;
};

export type GitFileBlameRequest = {
  path: string;       // repo root
  file_path: string;  // relative
};

export type GitFileBlameResponse = {
  file_path: string;
  blob_id: string | null;
  kind: GitFileBlameKind;
  ranges: GitBlameRange[];
  commits: Record<string, GitBlameCommit>;
};

export type GitCommitDetailRequest = {
  path: string;
  commit_hash: string;
};

export type GitCommitDetailResponse = {
  hash: string;
  body: string | null;
  files_changed: number;
  insertions: number;
  deletions: number;
};
```

No SQLite.

## Caching

<!-- updated 2026-09-15: two-layer file/SHA cache; blob fingerprint; reject commit LRU -->

**Rejected:** keep the last N commits and drop the oldest. Blame answers “this **file’s** every line → SHA”. Line 1 may be years old; dropping “old” commits makes that line unanswerable. Cost is **per file** (`git blame`), not per recent commit.

### Layer 1 — whole-file blame (expensive)

| | |
|--|--|
| **Identity** | Computer + repo + relative path + **this file’s blob fingerprint** (`blob_id` / worktree `hash-object`). Not repo `HEAD` (other files committing must not bust this file). |
| **Value** | Coalesced `ranges` (the full line map) + compact `commits` summaries (author, time, subject). No `--stat`, no body, no file text. |
| **When to fetch** | File tab opens / becomes active **and** there is no live Query for that key. Save of **this** file, discard, or worktree bytes changing (new `blob_id`) → new fetch. |
| **Line / selection change** | **Memory only.** Binary-search `ranges` by 1-based line. Never `git_file_blame`. |
| **Switch file** | New Layer-1 query for the other path. The previous file’s Query **stays** in TanStack cache until `gcTime` (same idea as `gitFileDiffQueryOptions`). Re-opening a cached file is a hit if `blob_id` still matches. |
| **Engine** | Process map `(canonical_repo, relpath, blob_id) → FileBlameInfo`. Evict by **file entry** (~64), not by commit. Cache hit skips `git blame`. |

Client: `use-git-file-blame-query.ts` + `queryKeys.computer.gitFileBlame(scope, repoPath, filePath)`. Mirror `gitFileDiffQueryOptions` (`staleTime` ~5 min — blame is heavier than diff; `gcTime` 30 min like `GIT_LIST_GC_MS`). Include last-saved content hash in the query key **or** invalidate that file’s key on save / `gitDiffRefreshNonce` for that path so dirty→saved gets a new worktree blame. **Do not** put hover SHA or caret line in this key.

### Layer 2 — commit detail (cheap, lazy)

| | |
|--|--|
| **Identity** | Computer + repo + **commit SHA** (shared across files). |
| **Value** | `body`, `files_changed`, `insertions`, `deletions`. |
| **When to fetch** | First hover whose range SHA is not already in the detail cache. |
| **Reuse** | Same SHA on another line or another file → cache hit; no second `git show`. |
| **GC** | SHA-level LRU / TanStack `gcTime` is OK — the current-line widget does not need stats. |

Client: `use-git-commit-detail-query.ts` + `gitCommitDetail(scope, repoPath, sha)`, `enabled: Boolean(hoverSha)`.

### Invalidation (not “drop oldest commit”)

- **This file saved / restored / worktree hash changed** → invalidate **that** Layer-1 key only.
- **Branch checkout / this file’s blob changed** → Layer-1 miss (new `blob_id`). Other files’ Layer-1 entries remain until their blob changes or `gcTime`.
- **Do not** invalidate every open file because repo `HEAD` moved.
- Blame setting off → unmount extension; leave Query cache (turning it back on can hit).
- Hover / caret must never dispatch Layer 1.

### Lookup path

```
open file.ts  →  git_file_blame once  →  ranges in Query
select line 80  →  find range  →  widget from commits[sha]
hover sha aaa  →  git_commit_detail if missing
open other.ts  →  git_file_blame(other.ts); file.ts stays cached
hover aaa again  →  Layer 2 hit
```

## Transport

### WebSocket messages

**No REST.** Git blame is interactive Computer RPC on the existing `/ws` session.

```ts
// request
wsRequest("git_file_blame", { path, file_path });
// output: GitFileBlameResponse (kind may be skip)

// request
wsRequest("git_commit_detail", { path, commit_hash });
// output: GitCommitDetailResponse
```

Invariants:

- `git_file_blame` returns `kind !== "ok"` with **empty** `ranges` / `commits` for skip cases — not a WS error.
- `git_commit_detail` is only called for a real SHA from `commits`.
- Payload stays compact: ranges, not one object per line. Do not send file text.
- Caret, selection, and hover must not call `git_file_blame`. Hover may call `git_commit_detail` **once per unseen SHA**.
- Response includes `blob_id` so engine and client agree on file identity.

### REST

None. Function settings already use `function_settings_update` (existing WS).

## Frontend behavior (M1–M8)

### Current-line annotation (M1)

- `ViewPlugin` + `Decoration.widget({ side: 1 })` at the **end of the primary selection’s line**.
- Resolve SHA with a range lookup on the **already fetched** Layer-1 payload (binary search on `start_line`). Caret movement is not a network event.
- Text: truncated `subject` + author + relative time (date-fns `formatDistanceToNow`, locale-aware). Uncommitted: localized “Not Committed Yet”.
- `pointer-events: auto` on the widget so hover hits it. Muted `text-muted-foreground`, no layout jump beyond one widget.
- Only **one** widget (current line), not every line.

### Hover card (M2, M3)

- `@codemirror/view` `hoverTooltip` with `hoverTime` ~300ms. Source: if pos is on the current-line widget **or** on a line whose range has a commit, return a tooltip spanning that line.
- DOM structure (no `<hr>`, no `border-t`, no `Separator`):
  1. Author (medium) + relative time; absolute timestamp as tooltip on the relative time.
  2. Subject (body-sm / medium).
  3. Body (muted, wrap, clamp ~8 lines).
  4. Stats row: `{n} files changed`, green insertions, red deletions — hidden until detail arrives; no skeleton bar that looks like a divider.
  5. Short hash + copy control (inline Check, no toast).
- Tokens: `bg-popover`, `text-popover-foreground`, `rounded-xl` (~14px overlay), padding, gap. Dark/light via existing editor theme.
- Author avatar: optional initials circle (reuse CommitList idea). No Gravatar network in v1 unless `author_avatar_url` is already cheap; **v1 = initials only**.

### Dirty buffer mapping (M6, M8)

Blame the **on-disk** worktree file (same source as `git blame`). Map disk line → current doc line using the document vs last-saved text:

- Reuse the last-saved string already used for the git gutter (`GitGutterHost.originalContent` / editor saved value).
- Build a line map from `Chunk` / `@codemirror/merge` (already a dependency of the gutter) **or** a simple LCS of line arrays if the gutter state is off.
- Inserted lines → uncommitted. Deleted disk lines → drop. Unchanged / shifted lines keep SHA.
- If mapping is too expensive (file already skipped) or docs mismatch wildly, hide blame rather than show wrong SHAs.

### Settings (M4, M5)

- Key: `editor.git_blame` in `function_settings.json`. Missing → **true**.
- Independent of `editor.git_integration`.
- Header popover row labeled **Git blame** (sentence case), tooltip: “Show the commit that last changed the current line.”
- Settings → Editor same copy.
- Toggling off: `Compartment.reconfigure([])` immediately; do not keep hover plugins mounted.
- i18n both locales (M7).

### When blame is enabled

`gitBlame && gitDiffSource?.repoPath && gitDiffSource?.fileRelativePath` (same path plumbing as the change gutter). Markdown Live: **unmounted** CodeMirror — no blame (PRD). Preview-only / binary FileViewer: no CodeMirror blame.

## Security & permissions

- Same Computer WS auth as other `git_*` actions.
- `file_path` must stay inside `path` (repo root) after `expand_path`.
- Do not log full blame porcelain. Do not put commit emails in UI except optionally in a tooltip; v1 shows **name** only.
- Copy hash writes clipboard only, no extra telemetry.

## Rollout plan

1. **Engine**: `file_blame` + `commit_detail` + blob-fingerprint file cache + `#[cfg(test)]` on a temp repo (committed lines, uncommitted edit, binary skip, coalesce, cache hit on unchanged blob).
2. **Transport**: `WsAction` + DTOs (`blob_id`) + router + `@atmos/api-types` contract extract; `gitApi` wrappers.
3. **Query + CM extension**: two TanStack keys (file blame vs SHA detail), current-line widget from range lookup, hover card without stats, skip kinds.
4. **Lazy Layer-2 stats + dirty mapping** + copy hash. Assert hover/caret does not change the blame query key.
5. **Settings**: `gitBlame` default on, header gear + Editor settings row, i18n, Compartment toggle.

Each step compiles. 1–2 can merge without UI; 3–5 are the user-visible ship.

## Risks & tradeoffs

- **Tradeoff**: two WS actions instead of embedding `--stat` in every unique SHA on blame. Hover of a 200-SHA file would otherwise run 200 `git show`s up front. Lazy `git_commit_detail` matches M8.
- **Tradeoff**: cache **whole-file ranges** (and GC unused **files**), not “last N commits.” A commit LRU cannot answer an old line in the current file. SHA-level LRU is only for Layer 2 stats.
- **Tradeoff**: invalidate on **this file’s `blob_id`**, not repo `HEAD`. A commit in another file must not re-blame the open tab.
- **Tradeoff**: CM `hoverTooltip` DOM vs Radix `Popover`. Radix steals focus and fights CM hover. Style the CM tooltip as Atmos instead.
- **Tradeoff**: current-line widget only vs every-line gutter. Every-line is N2; v1 stays GitLens-lite to avoid width fight with the change gutter.
- **Risk**: dirty mapping bugs show the wrong commit. Prefer uncommitted / hide over a wrong SHA.
- **Risk**: Relay payload on huge files. Skip at 1.5 MiB / 10k lines; coalesce ranges.
- **Risk**: `git blame` CPU on generated JSON. Skip thresholds + setting off.
- **If this breaks in production**: default remains on, but users can disable in the header gear; rollback is “remove the Compartment + WS handlers” without touching the change gutter.

## Dependencies & compatibility

- Depends on: existing git WS session, `function_settings_update`, CodeMirror 6 (`@codemirror/view` hoverTooltip / widget), `@codemirror/merge` Chunk (optional mapping).
- Blocks: nothing.
- Minimum Atmos: current main; no CLI pin.
- External: `git` on the Computer (already required). No `gh` for v1.

## Open questions

- [x] WS names — `git_file_blame` + `git_commit_detail`.
- [x] Skip caps — 1.5 MiB and 10_000 lines.
- [x] Avatars — initials only in v1.
- [x] Cache — two layers (file ranges + lazy SHA stats); blob fingerprint; no N-commit LRU.
- [ ] N1 click-to-history: not in this rollout.
