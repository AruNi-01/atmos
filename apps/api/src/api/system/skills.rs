use serde_json::{json, Value};
use tokio::fs;

const DEFAULT_BEST_FOR: &str = "Code review tasks configured in system skills";

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
                    for line in content.lines() {
                        let trimmed = line.trim();
                        if let Some(val) = trimmed.strip_prefix("bestFor:") {
                            best_for = val.trim().to_string();
                        } else if let Some(val) = trimmed.strip_prefix("description:") {
                            let val = val.trim();
                            if !val.is_empty() {
                                description = val.to_string();
                            }
                        }
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
        "fullstack-reviewer" => {
            *label = "Fullstack Reviewer".into();
            if *best_for == DEFAULT_BEST_FOR {
                *best_for = "Fullstack review for any project".into();
            }
        }
        "code-review-expert" => {
            *label = "Backend Arch Expert".into();
            if *best_for == DEFAULT_BEST_FOR {
                *best_for = "Complex backend logic, API, and DB architectural reviews".into();
            }
        }
        "typescript-react-reviewer" => {
            *label = "TypeScript React Expert".into();
            if *best_for == DEFAULT_BEST_FOR {
                *best_for = "React/Next.js frontend applications".into();
            }
        }
        _ => {}
    }
}
