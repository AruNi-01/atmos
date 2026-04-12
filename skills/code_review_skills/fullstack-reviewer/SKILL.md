---
name: fullstack-reviewer
version: "1.0.0"
description: "This skill should be used when the user asks to review code, review my changes, code review, review this project, check code quality, security review, find bugs, or requests a comprehensive, structured code review covering both frontend and backend."
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
`[projectName]_[branchName]_YYYYMMDD-HHMMSS_[reviewTopic].md`
- The time portion MUST be numeric-only `HHMMSS` (e.g., `143815`) to remain cross-platform safe.
- `[reviewTopic]` MUST be a dynamically generated 1-5 word slug describing the core changes being reviewed (e.g., `auth_fix`, `ui_refactor`).
- Example filename: `atmos_main_20260225-143815_overview_tab_redesign.md`

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

---

## Critical Rules - MUST FOLLOW ⚠️

### 1. Verify Before Flagging

**NEVER** report an issue based on assumptions. For EVERY finding, you MUST:

1. **Read the actual code** — Examine the file and surrounding context
2. **Trace the data flow** — Follow variables/parameters to understand their origin and validation
3. **Check related files** — Auth might be in middleware, validation might be in DTO layer, etc.
4. **Verify the field/property/type exists** — Don't suggest checking fields that don't exist in the codebase

**BEFORE reporting any issue, ask yourself:**
- "Did I read the actual file that contains this code?"
- "Can I point to the exact line that demonstrates the problem?"
- "Is this issue real, or am I assuming something exists?"

**Examples of INCORRECT findings (DO NOT DO THIS):**
- ❌ Suggesting to check a field/property that doesn't exist in the type definition
- ❌ Claiming "missing authorization" when auth is handled by middleware
- ❌ Reporting "race condition" without proving concurrent access actually exists
- ❌ Proposing validation for inputs that are already constrained by types/enums

### 2. Security Findings Require Extra Verification

For ANY security-related finding (P0/P1), you MUST:

1. **Trace the complete data flow** — From user input to final usage
2. **Check for validation layers** — Middleware, DTOs, schema validation, ORM-level constraints
3. **Verify the threat model** — Is this user-controlled? Is it actually accessible?
4. **Consider the architecture** — Where are auth checks performed in this codebase?
5. **Check if the issue is mitigated elsewhere** — Database constraints, framework protections, etc.

**Only report as P0/P1 if:**
- The vulnerability is exploitable in the current architecture
- The fix is not already implemented elsewhere (middleware, framework, database, etc.)
- The impact is clearly severe (data loss, security breach, correctness bug)

### 3. Severity Level Calibration

Use conservative thresholds to avoid "review fatigue":

| Level | When to Use |
|-------|-------------|
| **P0** | Confirmed exploits, data loss, corruption, crashes in production code |
| **P1** | Bugs affecting correctness, exploitable security issues, real performance regressions |
| **P2** | Code smells, maintainability issues, minor violations |
| **P3** | Style, naming, nitpicks |

**Lower your severity if:**
- The issue is theoretical with no proven impact
- A framework/library already handles this
- The fix requires significant refactoring for minor gain
- The pattern is actually valid in this project's context
- The code already has error handling (even if not perfect)

### 4. Context-Aware Review

Before flagging an issue:

1. **Understand the business logic** — Why was this code written this way?
2. **Check for trade-offs** — Complexity might be intentional for performance or readability
3. **Look for patterns** — Is this how the project does things consistently?
4. **Consider the scope** — Is this production code, internal tool, or prototype?
5. **Read related files** — Don't judge code in isolation

**Red flags that indicate you're over-reviewing:**
- Finding 10+ P1 issues in a small PR (<500 lines)
- Suggesting major architecture changes for a simple bug fix
- Proposing "best practices" that don't fit the project's established patterns
- Marking non-blocking issues as P1

## Additional Resources

### Reference Files

Detailed checklists loaded as needed during review:

| File | Scope |
|------|-------|
| `references/frontend-checklist.md` | React/Vue/Angular/Svelte, CSS, accessibility, component patterns |
| `references/backend-checklist.md` | API design, DB queries, concurrency, error handling (multi-language) |
| `references/security-checklist.md` | XSS, injection, auth, secrets, CORS, CSRF, race conditions |
| `references/architecture-checklist.md` | SOLID, code smells, coupling, cohesion, refactor heuristics |
