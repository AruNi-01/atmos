---
name: code-review-expert
version: "1.2.0"
description: "Expert code review of current git changes with a senior engineer lens. Detects SOLID violations, security risks, and proposes actionable improvements."
---

# Code Review Expert

## Overview

Perform a structured review of the current git changes with focus on SOLID, architecture, removal candidates, and security risks. Default to review-only output unless the user asks to implement changes.

## Atmos Review Session Integration

When the prompt contains a `<review-agent-run>` block, the session may target either a **workspace** (isolated git worktree) or a **project** (the project's main checkout). The reviewer flow is target-agnostic — it only needs the `session`, `current_revision_guid`, and `run` GUIDs from the block — but respect the target kind if you need to read repo state (target kind is visible in the output of `atmos review session-show --session <session_guid>`).

Use the run/session metadata to create one inline comment per concrete finding:

```bash
atmos review create-comment \
  --session <session_guid> \
  --revision <current_revision_guid> \
  --file <path> \
  --side new \
  --start-line <line> \
  --end-line <line> \
  --title "<short title>" \
  --run <run_guid> \
  --body-stdin <<'EOF'
Severity: P1
Issue: ...
Suggestion: ...
EOF
```

Prefer `--body-stdin` (or `--body-file <path>`) for multi-line bodies; `--body "..."` is only for short single-line text. After the review is complete, call:

```bash
atmos review set-status --run <run_guid> succeeded --summary-stdin <<'EOF'
<one-paragraph summary>
EOF
```

If the run cannot be completed, call `atmos review set-status --run <run_guid> failed --message "<reason>"`.

For the full command surface (session discovery, comment reading, run lifecycle, body-input conventions, and workspace vs project semantics), see [`references/atmos-review-cli.md`](references/atmos-review-cli.md).

## Severity Levels

| Level | Name | Description | Action |
|-------|------|-------------|--------|
| **P0** | Critical | Security vulnerability, data loss risk, correctness bug | Must block merge |
| **P1** | High | Logic error, significant SOLID violation, performance regression | Should fix before merge |
| **P2** | Medium | Code smell, maintainability concern, minor SOLID violation | Fix in this PR or create follow-up |
| **P3** | Low | Style, naming, minor suggestion | Optional improvement |

## Workflow

### 1) Preflight context

- Use `git status -sb`, `git diff --stat`, and `git diff` to scope changes.
- If needed, use `rg` or `grep` to find related modules, usages, and contracts.
- Identify entry points, ownership boundaries, and critical paths (auth, payments, data writes, network).

**Edge cases:**
- **No changes**: If `git diff` is empty, inform user and ask if they want to review staged changes or a specific commit range.
- **Large diff (>500 lines)**: Summarize by file first, then review in batches by module/feature area.
- **Mixed concerns**: Group findings by logical feature, not just file order.

### 2) SOLID + architecture smells

- Load `references/solid-checklist.md` for specific prompts.
- Look for:
  - **SRP**: Overloaded modules with unrelated responsibilities.
  - **OCP**: Frequent edits to add behavior instead of extension points.
  - **LSP**: Subclasses that break expectations or require type checks.
  - **ISP**: Wide interfaces with unused methods.
  - **DIP**: High-level logic tied to low-level implementations.
- When you propose a refactor, explain *why* it improves cohesion/coupling and outline a minimal, safe split.
- If refactor is non-trivial, propose an incremental plan instead of a large rewrite.

### 3) Removal candidates + iteration plan

- Load `references/removal-plan.md` for template.
- Identify code that is unused, redundant, or feature-flagged off.
- Distinguish **safe delete now** vs **defer with plan**.
- Provide a follow-up plan with concrete steps and checkpoints (tests/metrics).

### 4) Security and reliability scan

- Load `references/security-checklist.md` for coverage.
- Check for:
  - XSS, injection (SQL/NoSQL/command), SSRF, path traversal
  - AuthZ/AuthN gaps, missing tenancy checks
  - Secret leakage or API keys in logs/env/files
  - Rate limits, unbounded loops, CPU/memory hotspots
  - Unsafe deserialization, weak crypto, insecure defaults
  - **Race conditions**: concurrent access, check-then-act, TOCTOU, missing locks
- Call out both **exploitability** and **impact**.

### 5) Code quality scan

- Load `references/code-quality-checklist.md` for coverage.
- Check for:
  - **Error handling**: swallowed exceptions, overly broad catch, missing error handling, async errors
  - **Performance**: N+1 queries, CPU-intensive ops in hot paths, missing cache, unbounded memory
  - **Boundary conditions**: null/undefined handling, empty collections, numeric boundaries, off-by-one
- Flag issues that may cause silent failures or production incidents.

### 6) Output format

Structure your review as follows:

> **Traceability frontmatter**: When this review is run inside an Atmos review session, the prompt will include a ready-to-copy YAML frontmatter block (under the key `atmos_review`). If you write the review to a Markdown report file, write that block **verbatim** as the very first lines of the file, before the `## Code Review Summary` heading. Do not edit, reformat, or omit any field. When there is no session context, omit the frontmatter.

Example of the frontmatter the prompt will supply:

```yaml
---
atmos_review:
  session_guid: "<guid>"
  run_guid: "<guid>"
  base_revision_guid: "<guid>"
  current_revision_guid: "<guid>"
  skill_id: "code-review-expert"
  generated_at: "<ISO-8601 UTC>"
---
```

```markdown
## Code Review Summary

| Entry | Details |
| :--- | :--- |
| **Files Reviewed** | X files, Y lines changed |
| **Overall Assessment** | **APPROVE** \| **REQUEST_CHANGES** \| **COMMENT** |

---

## Findings

### P0 - Critical
(none or list)

### P1 - High
- **[file:line]** Brief title
  - Description of issue
  - Suggested fix

### P2 - Medium
...

### P3 - Low
...

---

## Removal/Iteration Plan
(if applicable)

## Additional Suggestions
(optional improvements, not blocking)
```

**Inline comments**: Use this format for file-specific findings:
```
::code-comment{file="path/to/file.ts" line="42" severity="P1"}
Description of the issue and suggested fix.
::
```

**Clean review**: If no issues found, explicitly state:
- What was checked
- Any areas not covered (e.g., "Did not verify database migrations")
- Residual risks or recommended follow-up tests

### 7) Next steps confirmation

After presenting findings, ask user how to proceed:

```markdown
---

## Next Steps

I found X issues (P0: _, P1: _, P2: _, P3: _).

**How would you like to proceed?**

1. **Fix all** - I'll implement all suggested fixes
2. **Fix P0/P1 only** - Address critical and high priority issues
3. **Fix specific items** - Tell me which issues to fix
4. **No changes** - Review complete, no implementation needed

Please choose an option or provide specific instructions.
```

**Important**: Do NOT implement any changes until user explicitly confirms. This is a review-first workflow.

## Resources

### references/

| File | Purpose |
|------|---------|
| `solid-checklist.md` | SOLID smell prompts and refactor heuristics |
| `security-checklist.md` | Web/app security and runtime risk checklist |
| `code-quality-checklist.md` | Error handling, performance, boundary conditions |
| `removal-plan.md` | Template for deletion candidates and follow-up plan |
| `atmos-review-cli.md` | Shared Atmos review CLI reference (symlinked from `atmos-review-fix`) |
