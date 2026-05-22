/// Extract description from markdown content (first paragraph or first few lines).
pub(super) fn extract_description(content: &str) -> String {
    let (content_to_parse, frontmatter) = strip_frontmatter(content);

    if let Some(fm) = frontmatter {
        if let Some(desc) = extract_from_frontmatter(fm, "description") {
            return desc;
        }
    }

    let lines: Vec<&str> = content_to_parse.lines().collect();
    let mut description_lines = Vec::new();
    let mut in_content = false;

    for line in lines {
        let trimmed = line.trim();

        if !in_content && trimmed.is_empty() {
            continue;
        }

        if trimmed.starts_with('#') {
            if in_content {
                break;
            }
            continue;
        }

        if trimmed.starts_with("```") {
            if in_content {
                break;
            }
            continue;
        }

        in_content = true;

        if trimmed.is_empty() && !description_lines.is_empty() {
            break;
        }

        description_lines.push(trimmed);
        if description_lines.len() >= 3 {
            break;
        }
    }

    description_lines.join(" ")
}

/// Strip YAML frontmatter (between --- and ---) from content.
pub(super) fn strip_frontmatter(content: &str) -> (&str, Option<&str>) {
    if let Some(stripped) = content.strip_prefix("---") {
        if let Some(end_idx) = stripped.find("---") {
            let actual_end = end_idx + 3;
            let frontmatter = &content[3..actual_end];
            let rest = content[actual_end + 3..].trim_start();
            return (rest, Some(frontmatter));
        }
    }
    (content, None)
}

pub(super) fn extract_from_frontmatter(frontmatter: &str, field: &str) -> Option<String> {
    for line in frontmatter.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix(field) {
            if let Some(value) = rest.strip_prefix(':') {
                let val = value.trim();
                let val = val.trim_matches('"').trim_matches('\'');
                if !val.is_empty() {
                    return Some(val.to_string());
                }
            }
        }
    }
    None
}
