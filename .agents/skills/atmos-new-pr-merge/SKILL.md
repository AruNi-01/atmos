---
name: atmos-new-pr-merge
description: >
  Ship a finished feature or bugfix through a short-lived PR branch with archival history:
  create a branch from main (or another base), push commits, open a PR using the repo PR
  template, auto-merge into main, then checkout main and pull latest. Use whenever the user
  says "new pr merge", "开 PR 并合并", "创建 PR 然后合并到 main", "push 并合并", "leave a PR
  for the record", or runs /atmos-new-pr-merge. Prefer this over committing or pushing
  directly to main for routine feature work and bugfixes.
user-invokable: true
args:
  - name: base
    description: Base branch to branch from and merge into (default main)
    required: false
  - name: branch
    description: Explicit feature branch name; if omitted, derive from the change
    required: false
  - name: title
    description: PR title; if omitted, derive from the commit subject / change summary
    required: false
  - name: merge
    description: Merge after creating the PR (default true). Set false to only open the PR
    required: false
  - name: delete_branch
    description: Delete the remote (and local tracking) branch after merge (default false). Set true only when the user explicitly wants the branch removed.
    required: false
  - name: dry_run
    description: Print the planned branch/PR/merge steps without mutating git or GitHub
    required: false
---

# Atmos new-PR-merge

Ship **finished** feature work or bugfixes via a **PR-first** path so `main` stays clean and
every change leaves a PR archive. **Never commit or push directly to `main`.**

## When to use

- Small/medium feature or bugfix is done (or about to be committed)
- User wants: branch → PR (template) → merge → back on latest `main`
- User wants PR history even when they will self-merge immediately

## When **not** to use

- Large multi-reviewer work that should stay open for review (`merge=false` only if they still want the PR opened)
- Release / deploy / version-tag flows → use the dedicated release/deploy skills
- Spec-only planning work with no code yet
- User only wants a local commit (no remote)

## Defaults

| Item | Default |
|------|---------|
| Base / merge target | `main` (override with `base`) |
| Merge after PR | **yes** (`merge=true`) |
| Merge strategy | `gh pr merge --merge` (merge commit; keeps PR node in history) |
| Delete remote branch after merge | **no** (keep the feature branch; use `delete_branch=true` only if asked) |
| End state | local `main` (or `base`) checked out + `git pull` |

## Hard rules

1. **Never** `git commit` / `git push` on `main` (or the configured base) for product work.
2. If currently on `main` with uncommitted changes → create/switch to a feature branch **before** staging/committing.
3. If already on a feature branch with the right commits → reuse it; do not invent a second branch unless asked.
4. Always open the PR with a body that **follows** `.github/PULL_REQUEST_TEMPLATE.md` sections (fill them in; do not leave the template comments empty of content).
5. After a successful merge: `git checkout <base> && git pull origin <base>` and confirm clean, up-to-date status.
6. Report the PR URL and final merge commit SHA to the user.

## Branch naming

Use a **professional type prefix** that matches the change — **never** personal name prefixes (e.g. do not use `aarynlu/…`, `username/…`).

```text
<type>/<optional-area>-<short-kebab-summary>
```

| Prefix | Use when |
|--------|----------|
| `fix/` | Bugfix, incorrect behavior, regression |
| `feat/` | New user-facing capability |
| `refactor/` | Internal restructure without intended behavior change |
| `chore/` | Tooling, deps, non-product housekeeping |
| `docs/` | Documentation-only |
| `perf/` | Performance improvement |
| `test/` | Tests only |

Examples:

- `fix/web-mention-file-search`
- `feat/terminal-ai-input-scroll`
- `refactor/composer-popover-scroll-helper`
- `chore/agents-new-pr-merge-skill`

Derive `<type>` from the actual diff and conventional commit type; keep the slug short and specific. If `branch` is provided by the user, use it as-is (after validating it is not `main` / the base and does not use a personal-name prefix unless they insisted).

## Standard flow

### 0. Preconditions

```bash
git status
git rev-parse --abbrev-ref HEAD
git fetch origin
```

- Confirm repo is Atmos and `gh` is authenticated.
- If `dry_run=true`: print the full plan (branch name, commit plan, `gh pr create` title/body outline, merge command) and **stop**.
- If working tree has unrelated dirty files the user did not intend to ship → stop and ask.

### 1. Base branch

```bash
BASE="${base:-main}"
git fetch origin "$BASE"
```

If the work is not yet branched:

```bash
# clean base
git checkout "$BASE"
git pull origin "$BASE"

# new branch for the work
git checkout -b "<branch>"
```

If already on a non-base feature branch that contains the work → keep it (unless user passed a different `branch`).

### 2. Commit (only if needed)

If there are staged/uncommitted changes that belong to this ship:

1. Review `git status` + `git diff`
2. Stage only relevant files (not secrets, not unrelated dirt)
3. Commit with a **conventional** subject, complete sentences in the body:

```text
fix(web): improve composer @ file search and popover keyboard scroll

Match @ mentions by file/folder name only, highlight keywords, and keep
3 peek rows when arrow-navigating @ and / popovers.
```

Do **not** invent extra files or drive-by refactors.

### 3. Push branch

```bash
git push -u origin HEAD
```

### 4. Create PR from template

Read and honor:

- `.github/PULL_REQUEST_TEMPLATE.md`

Fill every section with real content (checkboxes marked for what is true). Structure:

```markdown
## Summary

<1–5 bullets: what changed and why>

## Related Issue

Closes #<n>   # or N/A

## Type of Change

- [x] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Documentation
- [ ] Chore / tooling

## Validation

- [ ] `just lint`
- [ ] `just test`
- [ ] `just fmt`
- [x] <actual checks you ran, e.g. targeted bun test>

## Checklist

- [ ] I updated documentation if behavior changed
- [x] I added/updated tests where appropriate
- [x] I followed repository conventions and AGENTS.md guidance
```

Create:

```bash
gh pr create --base "$BASE" --head "<branch>" --title "<title>" --body "$(cat <<'EOF'
...filled template...
EOF
)"
```

Title: conventional and specific (same spirit as the commit subject). Prefer the `title` arg when provided.

### 5. Merge (default)

If `merge` is not `false`:

```bash
# Default: keep the feature branch after merge
gh pr merge <number-or-url> --merge

# Only when delete_branch=true / user explicitly asks to remove the branch:
# gh pr merge <number-or-url> --merge --delete-branch
```

Notes:

- Prefer **`--merge`** (merge commit) so the PR remains a clear archive node on `main`.
- **Do not** pass `--delete-branch` by default. Feature branches are part of the archive trail and are useful for follow-ups; delete only when `delete_branch=true` or the user explicitly asks.
- Use `--squash` only if the user explicitly asks.
- If merge is blocked (required checks, permissions), report the PR URL and the blocker; do not force unless the user explicitly requests a force path (usually there is none).

If `merge=false`: stop after PR creation and give the URL.

### 6. Return to latest base

```bash
git checkout "$BASE"
git pull origin "$BASE"
git status
git log -3 --oneline
```

Confirm:

- on `$BASE`
- clean working tree (or only pre-existing unrelated dirt the user already had)
- up to date with `origin/$BASE`

### 7. Report back

Always tell the user:

- branch name
- PR URL
- merged? (yes/no)
- merge commit / tip of `$BASE`
- local branch now checked out

## Decision matrix

| Situation | Action |
|-----------|--------|
| On `main`, dirty with the intended fix | `checkout -b` feature branch → commit → push → PR → merge → back to `main` |
| On feature branch, uncommitted | commit on that branch → push → PR → merge → back to base |
| On feature branch, already committed, not pushed | push → PR → merge → back to base |
| PR already open for this branch | skip create; merge if requested; then pull base |
| User says “only open PR” | `merge=false` |
| User says “don’t touch remote yet” | stop after local branch + commit (or dry-run) |
| User says “delete the branch after merge” | `delete_branch=true` → add `--delete-branch` |

## Anti-patterns (never)

- `git push origin main` with product commits
- amending / force-pushing shared history without explicit request
- empty PR bodies or “see commits” with no Summary
- opening a PR from `main` into `main`
- merging someone else’s open review PR without the user asking
- skipping `git pull` after merge (leaves the user on a stale local base)
- deleting the feature branch after merge **unless** the user asked (`delete_branch=true`)

## Quick reference

```bash
# typical happy path (agent executes these with real names)
git fetch origin main
git checkout main && git pull origin main
git checkout -b fix/web-short-summary
# ... stage + commit ...
git push -u origin HEAD
gh pr create --base main --title "fix(web): …" --body "$(cat <<'EOF'
## Summary
…

## Related Issue
N/A

## Type of Change
- [x] Bug fix
…

## Validation
…

## Checklist
…
EOF
)"
gh pr merge <n> --merge
git checkout main && git pull origin main
```

## Summary

This skill is the Atmos **PR-archive ship path** for day-to-day features and bugfixes: branch off base, never land commits straight on `main`, open a template-compliant PR, auto-merge by default (**keep the feature branch**), then return the workspace to the latest base branch.
