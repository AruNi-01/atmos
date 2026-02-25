---
name: atmos-code-review
description: >
  Perform a structured code review of the user's project changes and write a Markdown report to a specified file.
  Use this skill when triggered by the Atmos code review feature to review staged/unstaged git changes or a PR diff.
  Works with any tech stack (frontend, backend, full-stack). Covers correctness, security, performance,
  maintainability, and best practices. Always writes the full report to OUTPUT_FILE — never stdout only.
---

# Atmos Code Review

This skill is invoked by the **Atmos platform** to review the user's project code. The review target is the **user's own project** (not Atmos itself). Atmos passes context via environment variables or CLI arguments.

## Inputs

| Variable | Source | Description |
|----------|--------|-------------|
| `OUTPUT_FILE` | Atmos UI (required) | Absolute path where the report must be written |
| `PROJECT_NAME` | Atmos UI | Project name for the report header |
| `BRANCH_NAME` | Atmos UI | Current git branch |
| `REVIEW_SCOPE` | Atmos UI (optional) | `staged`, `unstaged`, `all` (default: `all`) |

If `OUTPUT_FILE` is not set, derive it:
```bash
OUTPUT_FILE="${PWD}/.atmos/reviews/${PROJECT_NAME:-project}_${BRANCH_NAME:-branch}_$(date +%Y%m%d-%H%M%S).md"
mkdir -p "$(dirname "$OUTPUT_FILE")"
```

## Workflow

### 1. Understand the diff

```bash
git status                          # overview of changed files
git diff HEAD                       # all local changes (default)
git diff --staged                   # staged only
git diff <base>..<head>             # PR range
```

For large diffs (>300 lines), first list changed files and their line counts, then review file by file.

### 2. Detect the tech stack

Scan changed file extensions to determine which checklist(s) to apply:

| Stack | Indicators | Load checklist |
|-------|-----------|----------------|
| Frontend (React/TS) | `.tsx`, `.ts`, `.jsx`, `.js`, `.css`, `.vue` | [frontend-checklist.md](references/frontend-checklist.md) |
| Backend (any) | `.rs`, `.go`, `.py`, `.java`, `.kt`, `.rb`, `.php` | [backend-checklist.md](references/backend-checklist.md) |
| Config / Infra | `Dockerfile`, `*.yaml`, `*.toml`, `*.json`, `.env*` | Security + correctness only |
| Tests | `*.test.*`, `*.spec.*`, `*_test.*` | Coverage completeness |

Load only the relevant checklist(s). For full-stack changes, load both.

### 3. Analyze by severity

Classify every finding:

| Level | Emoji | Criteria |
|-------|-------|---------|
| P0 Critical | 🔴 | Security vulnerability, data loss, crash/panic, broken API contract |
| P1 High | 🟠 | Logic bug, race condition, unhandled error, memory leak |
| P2 Medium | 🟡 | Performance issue, design smell, missing test coverage, anti-pattern |
| P3 Low | 🔵 | Naming, style, minor refactor suggestion, nitpick |

**Stop and flag P0 issues immediately** — do not wait until the end of the review.

### 4. Write the report to OUTPUT_FILE

Use the exact template from [report-template.md](references/report-template.md).

Build the full report content in memory, then write it to `OUTPUT_FILE` in one operation:

```bash
cat > "$OUTPUT_FILE" << 'REPORT'
<full report content>
REPORT

# Confirm write succeeded
echo "✅ Report written: $OUTPUT_FILE ($(wc -l < "$OUTPUT_FILE") lines)"
```

### 5. Print summary to stdout

```
✅ Code review complete.
   Report: <OUTPUT_FILE>
   Issues: <N> critical  <N> high  <N> medium  <N> low
   Verdict: APPROVED | REQUEST CHANGES | NEEDS DISCUSSION
```

## Reference Documents

- **[frontend-checklist.md](references/frontend-checklist.md)** — React, TypeScript, state management, performance
- **[backend-checklist.md](references/backend-checklist.md)** — API design, error handling, security, DB patterns, concurrency
- **[report-template.md](references/report-template.md)** — Exact output template to follow
