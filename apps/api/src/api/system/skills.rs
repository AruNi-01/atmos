use serde_json::{json, Value};
use tokio::fs;

const DEFAULT_BEST_FOR: &str = "Code review tasks configured in system skills";

/// Parse field from YAML frontmatter (standard single-line format)
fn parse_frontmatter_field(content: &str, field: &str) -> Option<String> {
    // Find frontmatter block
    let content = content.trim_start();
    let rest = content.strip_prefix("---")?;
    let second_dash = rest.find("---")?;
    let frontmatter = &rest[..second_dash];
    let field_with_colon = format!("{field}:");

    // Look for field: "value" or field: value
    for line in frontmatter.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix(&field_with_colon) {
            let rest = rest.trim();
            if !rest.is_empty() {
                return Some(rest.trim_matches('"').trim_matches('\'').to_string());
            }
        }
    }
    None
}

/// Scan the code_review_skills directory and return structured skill metadata.
pub async fn scan_review_skills() -> Vec<Value> {
    let home = std::env::var("HOME").unwrap_or_default();
    let base = std::path::PathBuf::from(&home).join(".atmos/skills/.system/code_review_skills");

    let mut skills: Vec<Value> = Vec::new();

    let mut entries = match fs::read_dir(&base).await {
        Ok(e) => e,
        Err(_) => return skills,
    };

    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        let metadata = match fs::metadata(&path).await {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !metadata.is_dir() {
            continue;
        }
        let dir_name = entry.file_name().to_string_lossy().to_string();
        let skill_md = path.join("SKILL.md");

        let mut label = dir_name
            .split('-')
            .map(|w| {
                let mut c = w.chars();
                match c.next() {
                    None => String::new(),
                    Some(f) => f.to_uppercase().to_string() + c.as_str(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ");

        let mut description = format!("Custom review skill for {}", dir_name);
        let mut best_for = DEFAULT_BEST_FOR.to_string();

        match fs::metadata(&skill_md).await {
            Ok(m) if m.is_file() => {
                if let Ok(content) = fs::read_to_string(&skill_md).await {
                    // Parse from frontmatter
                    if let Some(desc) = parse_frontmatter_field(&content, "description") {
                        description = desc;
                    }
                    if let Some(bf) = parse_frontmatter_field(&content, "bestFor") {
                        best_for = bf;
                    }
                }
            }
            _ => {}
        }

        let badge = if dir_name.contains("expert") {
            "Backend"
        } else if dir_name.contains("react") || dir_name.contains("typescript") {
            "TS/React"
        } else if dir_name.contains("fullstack") {
            "Fullstack"
        } else {
            "Review"
        };

        apply_well_known_overrides(&dir_name, &mut label, &mut best_for);

        skills.push(json!({
            "id": dir_name,
            "label": label,
            "badge": badge,
            "description": description,
            "bestFor": best_for,
        }));
    }

    skills
}

fn apply_well_known_overrides(dir_name: &str, label: &mut String, best_for: &mut String) {
    match dir_name {
        "typescript-react-reviewer" => {
            *label = "TypeScript React Expert".to_string();
            if *best_for == DEFAULT_BEST_FOR {
                *best_for = "React/Next.js frontend applications".to_string();
            }
        }
        "code-review-expert" => {
            *label = "Backend Arch Expert".to_string();
            if *best_for == DEFAULT_BEST_FOR {
                *best_for = "Complex backend logic, API, and DB architectural reviews".to_string();
            }
        }
        "fullstack-reviewer" => {
            *label = "Fullstack Reviewer".to_string();
            if *best_for == DEFAULT_BEST_FOR {
                *best_for = "Fullstack review for any project".to_string();
            }
        }
        _ => {}
    }
}

/// Result returned to the client after a successful scaffold.
#[derive(Debug)]
pub struct ScaffoldedSkill {
    /// Directory name under `code_review_skills/` — also usable as skill id.
    pub id: String,
    /// Absolute path to the new skill directory.
    pub path: std::path::PathBuf,
    /// `true` when the shared CLI reference (symlink target) is not yet on disk.
    /// The frontend can prompt the user to run "Sync Skills Manually" in that case.
    pub needs_sync: bool,
}

const SCAFFOLD_DIR_PREFIX: &str = "custom-review-skill";
const SCAFFOLD_MAX_ATTEMPTS: usize = 10;

/// Create a scaffolded custom review skill directory under
/// `~/.atmos/skills/.system/code_review_skills/`.
///
/// Layout:
/// ```text
/// code_review_skills/
/// └── custom-review-skill-<hex>/
///     ├── SKILL.md          (template with Atmos CLI integration prefilled)
///     └── references/
///         └── atmos-review-cli.md  -> ../../../atmos-review-fix/references/atmos-review-cli.md
/// ```
///
/// The symlink target resolves to the canonical `atmos-review-fix` skill owned reference.
pub async fn scaffold_review_skill() -> Result<ScaffoldedSkill, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    let system_dir = std::path::PathBuf::from(&home).join(".atmos/skills/.system");
    let base = system_dir.join("code_review_skills");
    fs::create_dir_all(&base)
        .await
        .map_err(|error| format!("failed to create code_review_skills dir: {error}"))?;

    // Pick a unique directory name.
    let mut chosen: Option<(String, std::path::PathBuf)> = None;
    for _ in 0..SCAFFOLD_MAX_ATTEMPTS {
        let suffix = uuid::Uuid::new_v4().simple().to_string();
        let suffix = &suffix[..6]; // short, readable
        let name = format!("{SCAFFOLD_DIR_PREFIX}-{suffix}");
        let candidate = base.join(&name);
        if !candidate.exists() {
            chosen = Some((name, candidate));
            break;
        }
    }
    let (skill_id, skill_dir) = chosen.ok_or_else(|| {
        format!(
            "failed to generate a unique skill directory after {SCAFFOLD_MAX_ATTEMPTS} attempts"
        )
    })?;

    fs::create_dir_all(skill_dir.join("references"))
        .await
        .map_err(|error| format!("failed to create skill references dir: {error}"))?;

    // Write the SKILL.md template.
    let skill_md_content = render_custom_skill_template(&skill_id);
    fs::write(skill_dir.join("SKILL.md"), skill_md_content)
        .await
        .map_err(|error| format!("failed to write SKILL.md: {error}"))?;

    // Create the relative symlink to the canonical atmos-review-cli.md.
    // `../../../atmos-review-fix/references/atmos-review-cli.md` resolves to
    // `<system_dir>/atmos-review-fix/references/atmos-review-cli.md` once the three
    // intermediate segments (references/, <skill_id>/, code_review_skills/) are traversed.
    let link_path = skill_dir.join("references").join("atmos-review-cli.md");
    let link_target =
        std::path::PathBuf::from("../../../atmos-review-fix/references/atmos-review-cli.md");
    create_symlink(&link_target, &link_path)
        .map_err(|error| format!("failed to create atmos-review-cli.md symlink: {error}"))?;

    let resolved_target = system_dir
        .join("atmos-review-fix")
        .join("references")
        .join("atmos-review-cli.md");
    let needs_sync = !resolved_target.exists();

    Ok(ScaffoldedSkill {
        id: skill_id,
        path: skill_dir,
        needs_sync,
    })
}

#[cfg(unix)]
fn create_symlink(target: &std::path::Path, link: &std::path::Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

#[cfg(windows)]
fn create_symlink(target: &std::path::Path, link: &std::path::Path) -> std::io::Result<()> {
    // Symlinks to files on Windows require either admin rights or Developer Mode.
    // We fall through to the file variant because the target is a markdown file.
    std::os::windows::fs::symlink_file(target, link)
}

fn render_custom_skill_template(skill_id: &str) -> String {
    format!(
        r#"---
name: {skill_id}
version: "0.1.0"
description: "Custom review skill. Replace this description with the scope your reviewer should cover."
bestFor: "Describe what kinds of changes this skill is best at reviewing"
---

# {skill_id}

> Scaffolded custom review skill. Fill in the sections below with your own review workflow, checklists, and output conventions.

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

| Level | Description | Action |
|-------|-------------|--------|
| **P0** | Critical — security vulnerability, data loss risk, correctness bug | Must block merge |
| **P1** | High — logic error, significant architectural violation, performance regression | Should fix before merge |
| **P2** | Medium — code smell, maintainability concern | Fix in this PR or create follow-up |
| **P3** | Low — style, naming, minor suggestion | Optional improvement |

## Review Workflow

<!-- TODO: describe the step-by-step review flow this skill should follow. -->

1. **Scope the review** — inspect the diff (`git diff`, `git diff --staged`) and group findings by logical feature, not just file order.
2. **Detect project stack** — identify frameworks / languages from config files (e.g. `package.json`, `Cargo.toml`, `pyproject.toml`) so the checklists below are relevant.
3. **Apply review checklists** — walk each changed file against the checklists you define below.
4. **Report findings** — for each issue, call `atmos review create-comment` as shown above with a severity, a short issue statement, and a concrete suggestion.
5. **Finalize the run** — summarize what you checked and close the run with `atmos review set-status <run_guid> succeeded --summary-stdin`.

## Review Focus

<!-- TODO: list the areas this skill specializes in. Delete bullets you don't need. -->

- Correctness and logic errors
- Error handling and failure modes
- Security (injection, auth, secret handling, etc.)
- Performance (hot paths, N+1 queries, memory)
- Architecture / SOLID / module boundaries
- Tests and coverage gaps
- Readability and naming

## Output Conventions

<!-- TODO: if this skill also writes a markdown report (in addition to inline comments),
     define the file naming scheme and report structure here. -->

### Traceability frontmatter

If this skill writes a review report to a Markdown file **and** the run was started inside an Atmos review session, the prompt will contain a ready-to-copy YAML frontmatter block (under the key `atmos_review`). Write that block **verbatim** as the very first lines of the report file, before any `#` heading. Do not edit, reformat, or omit any field. The frontmatter makes the report traceable back to the originating session and revision. When there is no session context (e.g. the skill is invoked ad-hoc without a `<review-agent-run>` block in the prompt), omit the frontmatter.

Example of the frontmatter the prompt will supply:

```yaml
---
atmos_review:
  session_guid: "<guid>"
  run_guid: "<guid>"
  base_revision_guid: "<guid>"
  current_revision_guid: "<guid>"
  skill_id: "{skill_id}"
  generated_at: "<ISO-8601 UTC>"
---
```
## Resources

### references/

| File | Purpose |
|------|---------|
| `atmos-review-cli.md` | Shared Atmos review CLI reference (symlinked from `atmos-review-fix`) |

<!-- TODO: add your own checklist files under references/ and list them here. -->
"#
    )
}

#[cfg(test)]
mod tests {
    use super::parse_frontmatter_field;

    #[test]
    fn parses_exact_frontmatter_field() {
        let content = r#"---
description: "Expert code review"
bestFor: React applications
---

# Skill
"#;

        assert_eq!(
            parse_frontmatter_field(content, "description"),
            Some("Expert code review".to_string())
        );
        assert_eq!(
            parse_frontmatter_field(content, "bestFor"),
            Some("React applications".to_string())
        );
    }

    #[test]
    fn does_not_match_field_prefixes() {
        let content = r#"---
descriptionLong: "Do not use this"
bestForExtended: "Do not use this either"
---

# Skill
"#;

        assert_eq!(parse_frontmatter_field(content, "description"), None);
        assert_eq!(parse_frontmatter_field(content, "bestFor"), None);
    }

    #[test]
    fn well_known_overrides_preserve_parsed_best_for() {
        let mut label = "Code Review Expert".to_string();
        let mut best_for = "Custom parsed guidance".to_string();

        super::apply_well_known_overrides("code-review-expert", &mut label, &mut best_for);

        assert_eq!(label, "Backend Arch Expert");
        assert_eq!(best_for, "Custom parsed guidance");
    }

    #[test]
    fn custom_skill_template_has_required_sections() {
        let id = "custom-review-skill-abc123";
        let content = super::render_custom_skill_template(id);

        // Frontmatter carries the generated id as skill name and scanner-friendly fields.
        assert!(content.starts_with("---\n"), "missing frontmatter opener");
        assert!(
            content.contains(&format!("name: {id}\n")),
            "frontmatter must set name to the generated id",
        );
        assert!(
            content.contains("version: \"0.1.0\"\n"),
            "frontmatter must set an initial version",
        );
        assert!(
            content.contains("description:"),
            "frontmatter must contain description",
        );
        assert!(
            content.contains("bestFor:"),
            "frontmatter must contain bestFor so scan_review_skills picks it up",
        );

        // Atmos Review Session Integration section must match the other review skills'
        // contract so custom skills Just Work with review runs.
        assert!(
            content.contains("## Atmos Review Session Integration"),
            "template must include the Atmos integration section",
        );
        assert!(
            content.contains("atmos review create-comment"),
            "template must document create-comment",
        );
        assert!(
            content.contains("atmos review set-status"),
            "template must document set-status",
        );
        assert!(
            content.contains("references/atmos-review-cli.md"),
            "template must point at the shared CLI reference",
        );
        assert!(
            content.contains("atmos_review:"),
            "template must document the atmos_review traceability frontmatter",
        );
        assert!(
            content.contains("session_guid:"),
            "template must show session_guid in the frontmatter example",
        );
        assert!(
            content.contains("current_revision_guid:"),
            "template must show current_revision_guid in the frontmatter example",
        );
    }
}
