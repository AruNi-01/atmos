---
name: atmos-docs-write
description: Update Atmos user documentation after product changes or releases. Use this whenever the user asks to write, refresh, sync, audit, or update Atmos docs, especially after a new version, GitHub Release, release-note file, spec implementation, CLI change, desktop/web/mobile feature change, or phrases like "发布后更新 docs", "帮我更新文档", "docs for this release", or "keep docs in sync". Reads release/spec/code evidence first, updates `apps/docs/content/docs` MDX in English and Chinese, keeps `meta.json` and `meta.zh.json` navigation aligned, verifies Fumadocs/Next checks, and avoids leaking internal implementation details into user docs.
user-invokable: true
args:
  - name: version
    description: Optional Atmos release version or tag, such as `2026.7.2`, `desktop-2026.7.2`, `cli-2026.7.2`, or `local-web-runtime-2026.7.2`. If omitted, infer scope from git diff, release notes, specs, or the user's prompt.
    required: false
  - name: scope
    description: Optional docs scope, such as `app`, `cli`, `desktop`, `web`, `mobile`, `runtime`, `features`, `workflows`, or `reference`.
    required: false
  - name: source
    description: Optional source of truth to start from, such as a spec id, release-notes file, PR, commit range, GitHub release URL, or local path.
    required: false
  - name: dry_run
    description: If true, report the proposed docs changes without editing files.
    required: false
---

# Atmos Docs Write

Use this skill to keep Atmos user-facing documentation current after product work or releases. The goal is not to dump release notes into docs. The goal is to translate shipped behavior into durable, task-oriented user documentation that matches the current docs app structure.

## What This Skill Owns

This skill owns user documentation under:

- `apps/docs/content/docs/**/*.mdx`
- `apps/docs/content/docs/**/meta.json`
- `apps/docs/content/docs/**/meta.zh.json`

It may read source files, release notes, specs, README files, product UI code, CLI help, and repository docs to verify behavior before writing.

This skill does not own:

- internal architecture docs under root `docs/`
- planning specs under `specs/`, except as source evidence
- landing-page changelog data; use `atmos-changelog` for `apps/landing/src/lib/changelog-data.ts`
- release creation; use the relevant Atmos release skill first
- marketing copy or launch assets

## Start Here

Before editing docs, read:

1. `AGENTS.md`
2. `apps/docs/AGENTS.md`
3. Existing nearby docs pages and the folder `meta.json` / `meta.zh.json` files you may touch
4. The relevant area AGENTS file for source evidence:
   - CLI: `apps/cli/AGENTS.md`
   - Web app: `apps/web/AGENTS.md`
   - Desktop: `apps/desktop/AGENTS.md`
   - Mobile: `apps/mobile/AGENTS.md`
   - API or WebSocket behavior: `apps/api/AGENTS.md`
   - Runtime: `agents/references/runtime/AGENTS.md`
   - Terminal agent defaults: `resources/terminal-agents/AGENTS.md`

Read `references/product-doc-principles.md` when creating new pages, doing a broad release docs pass, or when the prompt asks for documentation principles, style, or quality.

## Source Of Truth Order

Prefer direct, current evidence over secondary summaries:

1. Shipped source code, CLI help output, UI labels, API/WS behavior, config schemas
2. GitHub Release body or local `releasenotes/` file for the target release
3. Merged spec files (`PRD.md`, `TECH.md`, `TEST.md`) and completed review/progress logs
4. README and root docs as background
5. Commit messages only as hints; never as the only proof for user-facing behavior

If an item appears in a release note but cannot be verified in code or docs-adjacent source, mark it as a gap in the final report instead of inventing details.

## Default Workflow

### 1. Determine the docs scope

Resolve the input into a concrete source set:

- If `version` is provided, normalize it to a release tag when needed.
- If `source` names a release-notes file, PR, spec id, commit range, or URL, use it as the starting point.
- If neither is provided, inspect `git status --short`, recent release-note files, and the user's prompt to infer the changed surface.
- If scope remains ambiguous after inspection, ask one concise question before editing.

For GitHub releases, use `gh release view <tag>` or the GitHub release page. Do not assume "latest" without checking the actual release date and tag.

### 2. Build a user-visible change inventory

Create a short inventory before editing:

- New capabilities users can directly use
- Changed setup, install, update, auth, runtime, or workflow steps
- New or changed CLI commands, flags, output, config, or defaults
- Removed, renamed, deprecated, or behavior-changing items
- Troubleshooting-worthy failure modes
- Internal-only changes that should not become user docs

Classify each item into one of:

- `document`: update or create user docs now
- `mention`: small cross-link or sentence update only
- `skip`: internal, invisible, duplicate, speculative, or not shipped
- `gap`: needs missing product evidence or user clarification

### 3. Map inventory to the current docs IA

Use the existing docs structure:

- App basics: `apps/docs/content/docs/(app)/introduction*.mdx`, `getting-started*.mdx`
- App feature pages: `apps/docs/content/docs/(app)/features/*.mdx`
- App workflow pages: `apps/docs/content/docs/(app)/workflows/*.mdx`
- App reference: `apps/docs/content/docs/(app)/reference/*.mdx`
- CLI reference: `apps/docs/content/docs/cli/*.mdx`

Prefer updating an existing page when the topic already has a natural home. Create a new page only when the release introduced a durable concept that deserves its own route.

Root repository `docs/` is internal. When it contains useful product information, rewrite it into simpler user-facing docs under `apps/docs/content/docs/`; do not copy internal architecture detail verbatim.

### 4. Write English and Chinese together

Every user-visible MDX update must keep the English and Chinese pages aligned:

- Update `page.mdx` and `page.zh.mdx` in the same pass.
- Preserve the same information architecture, headings, steps, warnings, and cross-links.
- Translate naturally into Chinese. Do not paste English into `.zh.mdx` as a placeholder.
- Keep product names, commands, flags, code symbols, and URLs unchanged where appropriate.
- If a page cannot be fully translated in the same pass, leave a clear final-report gap instead of silently shipping mismatched docs.

### 5. Maintain navigation metadata

When adding, removing, renaming, or reordering pages:

- Update the folder's `meta.json`.
- Update the same folder's `meta.zh.json`.
- Keep `pages` arrays identical by slug between locales.
- Localize only titles, descriptions, and separator labels.
- Do not ship a `meta.zh.json` that omits `pages` when `meta.json` has `pages`.

This matters because Fumadocs builds a separate page tree per locale; missing Chinese `pages` arrays can reorder the sidebar alphabetically.

### 6. Use Atmos docs writing style

Keep pages compact, direct, and task-oriented:

- Start with what the user can do and why it matters.
- Prefer concrete steps, commands, UI labels, and expected outcomes.
- Use short sections such as `Overview`, `Get started`, `Common tasks`, `Tips`, `Related`, or page-specific equivalents.
- Link to adjacent docs instead of repeating long explanations.
- Avoid marketing hype, implementation archaeology, speculative roadmap language, and raw commit dumps.
- Avoid undocumented promises. If behavior is inferred, verify it first.
- Use MDX comments `{/* TODO */}` only when a placeholder is intentional; do not use HTML comments.

For CLI docs:

- Verify command names and flags from code or help output when feasible.
- Include common tasks as tables when that matches existing pages.
- Document defaults, update paths, and failure modes users can act on.

For workflows:

- Write the path a real user follows in the UI.
- Include prerequisites and cleanup when relevant.
- Link to feature pages for concepts and reference pages for exhaustive details.

For reference/troubleshooting:

- Prefer symptoms, likely causes, and exact recovery steps.
- Keep root-cause detail only when it changes what the user should do.

### 7. Edit carefully

Before applying changes:

- List the exact files you plan to touch.
- Check whether those files have user changes with `git diff -- <path>`.
- Do not rewrite whole pages when a targeted section update is enough.
- Preserve existing tone, frontmatter, link style, and heading level.

If `dry_run=true`, stop after producing the change inventory and file plan.

### 8. Verify

Run the narrowest useful checks after editing:

```bash
bun run --filter docs types:check
bun run --filter docs lint
```

For broad docs changes or navigation changes, also run:

```bash
bun run --filter docs build
```

When command docs changed, run the relevant CLI help or tests when feasible, for example:

```bash
cargo run -p atmos -- --help
cargo run -p atmos -- <command> --help
```

If dependencies or environment constraints block validation, report the exact command that was not run and why.

## Release Docs Refresh Checklist

Use this checklist after a new release:

1. Identify the target tag, release date, and release body.
2. Find the previous relevant tag and compare the release range if needed.
3. Read any local release-notes file under `releasenotes/`.
4. Convert release bullets into user-visible inventory items.
5. Update existing pages first; create pages only for durable new concepts.
6. Update English and Chinese together.
7. Update `meta.json` and `meta.zh.json` together.
8. Check links, headings, frontmatter, and stale version references.
9. Run docs validation.
10. Report coverage: documented, skipped, gaps, commands run.

## Final Report

Keep the final response short and useful:

- Source evidence used: release tag/file/spec/commit range
- Docs changed: grouped by App, CLI, Reference, or navigation
- Release coverage: documented / skipped / gaps
- Validation: exact commands and outcomes
- Any follow-up that needs product clarification

## Common Mistakes To Avoid

- Turning release notes into a changelog page instead of durable docs
- Creating a new page for every release bullet
- Updating English without Chinese, or vice versa
- Forgetting `meta.zh.json` when changing navigation
- Copying internal architecture from root `docs/` into user docs
- Documenting features that exist only in specs but have not shipped
- Inventing UI labels, flags, defaults, or shortcuts without checking source
- Overwriting user edits while "refreshing" docs
- Stopping after prose edits without running Fumadocs checks
