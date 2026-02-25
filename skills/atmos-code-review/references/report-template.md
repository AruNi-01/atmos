# Report Template

Use this exact structure. Fill in all sections; omit a section only if there are zero findings for that severity level.

---

```markdown
# Code Review Report

**Project**: {PROJECT_NAME}
**Branch**: {BRANCH_NAME}
**Reviewed at**: {YYYY-MM-DD HH:MM}
**Scope**: {e.g., "12 files changed, +340 -87 lines"}
**Verdict**: 🔴 REQUEST CHANGES | 🟡 NEEDS DISCUSSION | ✅ APPROVED

---

## Summary

{2–4 sentences: what the changes do, overall quality assessment, and the most important concern.}

---

## 🔴 Critical Issues (P0) — Must Fix Before Merge

### [C1] {Short title}

**File**: `path/to/file.ts`, line {N}
**Problem**: {Concrete description of the bug/vulnerability. Quote the relevant code snippet.}

```{lang}
// ❌ Current code
{snippet}
```

**Fix**:
```{lang}
// ✅ Suggested fix
{snippet}
```

**Why**: {Explain the risk — what can go wrong if this is not fixed.}

---

## 🟠 High Issues (P1) — Should Fix

### [H1] {Short title}

**File**: `path/to/file.rs`, line {N}
**Problem**: {Description}
**Suggestion**: {Concrete fix or approach}

---

## 🟡 Medium Issues (P2) — Recommended Improvements

### [M1] {Short title}

**File**: `path/to/file.tsx`
**Problem**: {Description}
**Suggestion**: {Concrete fix or approach}

---

## 🔵 Low / Nitpicks (P3)

| # | File | Line | Issue |
|---|------|------|-------|
| L1 | `file.ts` | 42 | Rename `data` to `userData` for clarity |
| L2 | `file.ts` | 87 | Remove unused import |

---

## ✅ What's Done Well

{2–5 bullet points highlighting good practices, clean code, or smart decisions in the diff.
Always include this section — constructive reviews acknowledge strengths.}

- {Positive observation 1}
- {Positive observation 2}

---

## Test Coverage

{Assess whether the changes include adequate tests. Note any missing test cases.}

- [ ] Unit tests for new logic
- [ ] Edge cases covered
- [ ] Error paths tested

---

## Checklist

- [ ] All P0 issues resolved
- [ ] All P1 issues addressed or explicitly deferred
- [ ] No new `TODO`/`FIXME` left without tracking issue
- [ ] Docs/comments updated if public API changed
```
