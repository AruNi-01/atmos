---
name: fullstack-reviewer
description:
  This skill should be used when the user asks to "review code", "review my changes",
  "code review", "review this project", "check code quality", "security review",
  "find bugs", or requests a comprehensive, structured code
  review covering both frontend and backend. It performs universal full-stack review
  for any user project (any language, any framework), outputs a structured Markdown
  report to the specified file path.
---

# Fullstack Code Reviewer

Perform a comprehensive, senior-engineer-level code review for the current project changes.
This skill is **project-agnostic** — it works with any language, framework, or tech
stack. Analyze git changes, detect issues across both frontend and backend code, and
output a structured Markdown report to the specified file path.

## Severity Levels

| Level | Label | Description | Action |
|-------|-------|-------------|--------|
| **P0** | 🔴 Critical | Security vulnerability, data loss risk, correctness bug | Must block merge |
| **P1** | 🟠 High | Logic error, significant architectural violation, performance regression | Should fix before merge |
| **P2** | 🟡 Medium | Code smell, maintainability concern, minor violation | Fix in this PR or create follow-up |
| **P3** | 🟢 Low | Style, naming, minor suggestion | Optional improvement |

## Workflow

### 1. Scope the Review

Determine what to review based on the user prompt and current git state:

```bash
git status -sb
git diff --stat
git diff
git diff --staged
```

**Edge cases:**
- **No changes**: Inform the user and ask whether to review staged changes, a specific commit range, or specific files.
- **Large diff (>500 lines)**: Summarize by file first, then review in batches by module/feature area.
- **Mixed concerns**: Group findings by logical feature, not just file order.

### 2. Detect Project Stack

Before reviewing, identify the project's technology stack by inspecting config files:

| Indicator | Stack |
|-----------|-------|
| `package.json` | Node.js / JavaScript / TypeScript ecosystem |
| `tsconfig.json` | TypeScript |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `requirements.txt` / `pyproject.toml` | Python |
| `pom.xml` / `build.gradle` | Java / Kotlin |
| `*.csproj` / `*.sln` | C# / .NET |
| `next.config.*` | Next.js |
| `vite.config.*` | Vite |
| `angular.json` | Angular |
| `vue.config.*` / `nuxt.config.*` | Vue / Nuxt |
| `Dockerfile` / `docker-compose.*` | Container |

Use the detected stack to apply relevant review checklists. For unfamiliar stacks, apply general best practices.

### 3. Classify Changed Files

Categorize each changed file:

| Category | Apply Checklist |
|----------|----------------|
| **Frontend** (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.css`, `.scss`, `.html`) | `references/frontend-checklist.md` |
| **Backend** (`.rs`, `.go`, `.py`, `.java`, `.cs`, `.rb`, `.ts` in server dirs) | `references/backend-checklist.md` |
| **Config / Infra** (`.toml`, `.yaml`, `.json`, `Dockerfile`, CI files) | Config & dependency review |
| **Tests** (`*_test.*`, `*.spec.*`, `*.test.*`) | Test quality review |
| **Documentation** (`.md`, `.rst`, `.txt`) | Accuracy & completeness |

### 4. Apply Review Checklists

Load the appropriate reference checklist(s) based on file categories:

- **`references/frontend-checklist.md`** — Component design, state management, hooks, rendering performance, accessibility, CSS
- **`references/backend-checklist.md`** — API design, error handling, concurrency, database queries, business logic
- **`references/security-checklist.md`** — XSS, injection, auth, secrets, CORS, CSRF, race conditions
- **`references/architecture-checklist.md`** — SOLID principles, code smells, coupling, cohesion, dependency management

For each file, check:
1. **Correctness** — Logic errors, off-by-one, null handling, boundary conditions
2. **Security** — Input validation, auth, injection, data exposure
3. **Performance** — N+1 queries, blocking operations, memory leaks, unnecessary computation
4. **Maintainability** — SOLID, readability, naming, complexity, dead code
5. **Error Handling** — Swallowed exceptions, missing fallbacks, error propagation
6. **Testing** — Coverage gaps, flaky test patterns, assertion quality

### 5. Generate the Report

When generating the review report, you MUST save it to the specified directory using the following dynamic file naming format:
`[projectName]_[branchName]_YYYYMMDD-HH:MM:SS_[reviewTopic].md`
- The time portion MUST use colons, exactly formatted as `HH:MM:SS` (e.g., `14:38:15`).
- `[reviewTopic]` MUST be a dynamically generated 1-5 word slug describing the core changes being reviewed (e.g., `auth_fix`, `ui_refactor`).
- Example filename: `atmos_main_20260225-14:38:15_overview_tab_redesign.md`

Write the review report to this file path. The report MUST follow this exact structure:

```markdown
# Code Review Report

| Entry | Details |
| :--- | :--- |
| **Date** | YYYY-MM-DD HH:MM |
| **Reviewer** | AI (fullstack-reviewer) |
| **Scope** | [description of what was reviewed — git diff / specific files / commit range] |
| **Project Stack** | [detected stack, e.g. "TypeScript + React 19 + Next.js / Rust + Axum"] |
| **Overall Assessment** | **APPROVE** \| **REQUEST_CHANGES** \| **COMMENT** |

---

## Summary

| Metric | Value |
|--------|-------|
| Files Reviewed | X |
| Lines Changed | +Y / -Z |
| P0 (Critical) | N |
| P1 (High) | N |
| P2 (Medium) | N |
| P3 (Low) | N |

---

## Findings by Severity

### 🔴 P0 — Critical
> None found. ✅
(or list each finding)

### 🟠 P1 — High

- **`path/to/file.ts:42`** — Brief title
  - **Category**: Security | Logic | Performance | Architecture | Error Handling
  - **Issue**: Description of the problem and why it matters.
  - **Suggestion**: Concrete fix, include code snippet when possible.
    ```language
    // suggested fix
    ```

### 🟡 P2 — Medium
(same format)

### 🟢 P3 — Low
(same format)

---

## Findings by File

### `path/to/file.ts`

| Line | Severity | Category | Issue | Suggestion |
|------|----------|----------|-------|------------|
| 42 | P1 | Security | Missing input validation | Add zod schema |
| 78 | P3 | Style | Unused import | Remove import |

### `path/to/other-file.rs`
(same table format)

---

## Architecture Notes

(Cross-cutting observations: coupling issues, layer violations, dependency direction,
design pattern suggestions. Skip if not applicable.)

## Positive Highlights

(Good patterns, clean implementations, thorough tests, or clever solutions worth
calling out. Always include at least one positive note.)

## Recommended Next Steps

1. [Most critical action]
2. [Second priority]
3. ...
```

**Important**: Create any parent directories automatically before writing the report.

### 6. Report Summary

After writing the report, print a concise summary to the console:

```
✅ Code Review Complete

📄 Report: {report_file_path}
📊 Results: P0={n} P1={n} P2={n} P3={n}
🏷️ Assessment: {APPROVE | REQUEST_CHANGES | COMMENT}

{one-line summary of the most important finding, or "No critical issues found."}
```

## Key Review Principles

1. **Be specific** — Reference exact file paths and line numbers.
2. **Explain why** — Every finding should state the impact, not just the observation.
3. **Provide fixes** — Include actionable code suggestions whenever possible.
4. **Stay pragmatic** — Distinguish blocking issues (P0/P1) from nice-to-haves (P2/P3).
5. **Acknowledge good work** — The "Positive Highlights" section is not optional.
6. **Be project-aware** — Respect the project's conventions and patterns over generic rules.

## Additional Resources

### Reference Files

Detailed checklists loaded as needed during review:

| File | Scope |
|------|-------|
| `references/frontend-checklist.md` | React/Vue/Angular/Svelte, CSS, accessibility, component patterns |
| `references/backend-checklist.md` | API design, DB queries, concurrency, error handling (multi-language) |
| `references/security-checklist.md` | XSS, injection, auth, secrets, CORS, CSRF, race conditions |
| `references/architecture-checklist.md` | SOLID, code smells, coupling, cohesion, refactor heuristics |
