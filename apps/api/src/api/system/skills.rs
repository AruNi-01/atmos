use serde_json::{json, Value};
use tokio::fs;

const DEFAULT_BEST_FOR: &str = "Code review tasks configured in system skills";

/// Parse field from YAML frontmatter (standard single-line format)
fn parse_frontmatter_field(content: &str, field: &str) -> Option<String> {
    // Find frontmatter block
    let first_dash = content.find("---")?;
    let second_dash = content[first_dash + 3..].find("---")? + first_dash + 3;
    let frontmatter = &content[first_dash + 3..second_dash];

    // Look for field: "value" or field: value
    for line in frontmatter.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(field) {
            let rest = trimmed.strip_prefix(field).unwrap_or("").trim();
            // Remove leading ":" if present (e.g., "description: \"xxx\"")
            let rest = rest.trim_start_matches(':').trim();
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
            *best_for = "React/Next.js frontend applications".to_string();
        }
        "code-review-expert" => {
            *label = "Backend Arch Expert".to_string();
            *best_for = "Complex backend logic, API, and DB architectural reviews".to_string();
        }
        "fullstack-reviewer" => {
            *label = "Fullstack Reviewer".to_string();
            *best_for = "Fullstack review for any project".to_string();
        }
        _ => {}
    }
}
