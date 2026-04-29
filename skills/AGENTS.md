# Skills Directory - AGENTS.md

> **🧩 System Skills Source**: Source-controlled skills that may be synced into users' local `~/.atmos/skills/.system/` installs.

---

## 📁 Directory Purpose

- `skills/` stores Atmos-managed skill sources such as `project-wiki`, `git-commit`, and `code_review_skills/*`
- Some skills in this directory are copied or synced to users' local system skills directory
- User-facing changes here may require a skill version bump so existing installs can upgrade correctly

---

## Syncing Model

- Source of truth lives in this directory
- Installed copies live under `~/.atmos/skills/.system/`
- Sync logic compares the installed skill version with the repo version from that skill's `SKILL.md` frontmatter
- If you change a synced skill but do not bump `version:`, existing user installs may stay on the old copy
- Raw GitHub fallback does not scan directories; it downloads only the files listed in `skills/system-skills-manifest.json`
- If you modify, add, or delete files under a synced skill, including files under `references/`, `scripts/`, or other non-`SKILL.md` paths, you must both bump `version:` and update `skills/system-skills-manifest.json` to match the new file set, or fallback install/upgrade will drift or miss files

---

## Versioning Rules

### ALWAYS
- Bump the `version:` field in the skill's `SKILL.md` when the changed skill is intended to be synced to users
- Use semantic versioning: `MAJOR.MINOR.PATCH` (example: `2.5.13`)
- Judge the bump by actual user-facing impact, not by commit prefix
- Take the highest applicable bump across the full change set
- Calculate the new version from the current skill version in `SKILL.md`

### NEVER
- Do not blindly map `feat:` to `MINOR`
- Do not skip a version bump for synced, user-facing skill changes

### Determine Version Bump

| What changed | Bump | Example |
|--------------|------|---------|
| Breaking change (incompatible API, config format, CLI args removed) | `MAJOR` | change API response structure: `1.4.2 -> 2.0.0` |
| New user-facing feature (new command, new capability) | `MINOR` | add export function: `1.4.2 -> 1.5.0` |
| Bug fix, performance improvement, internal refactor, docs, CI, tooling, adding skill files, dependency updates | `PATCH` | fix login bug: `1.4.2 -> 1.4.3` |

### Key Distinctions

- `feat:` in the commit message does not automatically mean `MINOR`; if the change only adds internal tooling, documentation, or skill files, it is still `PATCH`
- `MINOR` is reserved for new functionality users can actually use, such as a new command, new flag, new config option, or new skill capability
- When in doubt, prefer `PATCH`

---

## Safety Rails

### NEVER
- Edit a synced skill's behavior or assets and leave its `version:` unchanged
- Assume adding files is version-neutral for installed users; it is still at least a `PATCH` when the skill is synced

### ALWAYS
- Update the changed skill's `SKILL.md` frontmatter in the same PR as the functional change
- Keep the version bump scoped to the specific skill(s) that changed
- Update `skills/system-skills-manifest.json` whenever synced skill files are modified, added, renamed, or deleted
- Verify the manifest exactly matches the current file set required for raw sync

---

## Related Files

- `skills/system-skills-manifest.json` - raw sync file manifest
- `crates/infra/src/utils/system_skill_sync.rs` - system skill sync and version check logic
