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
    let lines: Vec<&str> = frontmatter.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        let trimmed = lines[i].trim();
        if let Some(rest) = trimmed.strip_prefix(field) {
            if let Some(value) = rest.strip_prefix(':') {
                let val = value.trim();

                // YAML block scalars: `>`, `>-`, `>+`, `|`, `|-`, `|+`
                // Folded (`>`) joins continuation lines with spaces; literal (`|`) keeps newlines.
                // Without this, `description: >-` would surface as the literal string `>-`.
                if is_yaml_block_scalar_indicator(val) {
                    let folded = val.starts_with('>');
                    let mut collected = Vec::new();
                    i += 1;
                    while i < lines.len() {
                        let line = lines[i];
                        // Block content is indented or blank; the next top-level key ends it.
                        if line.is_empty() || line.starts_with(' ') || line.starts_with('\t') {
                            collected.push(line.trim());
                            i += 1;
                        } else {
                            break;
                        }
                    }
                    let joined = if folded {
                        collected
                            .into_iter()
                            .filter(|s| !s.is_empty())
                            .collect::<Vec<_>>()
                            .join(" ")
                    } else {
                        collected.join("\n").trim().to_string()
                    };
                    if !joined.is_empty() {
                        return Some(joined);
                    }
                    continue;
                }

                let val = val.trim_matches('"').trim_matches('\'');
                if !val.is_empty() {
                    return Some(val.to_string());
                }
            }
        }
        i += 1;
    }
    None
}

fn is_yaml_block_scalar_indicator(val: &str) -> bool {
    matches!(val, ">" | ">-" | ">+" | "|" | "|-" | "|+")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_plain_description() {
        let fm = "name: demo\ndescription: Hello world\nversion: \"1.0\"";
        assert_eq!(
            extract_from_frontmatter(fm, "description").as_deref(),
            Some("Hello world")
        );
    }

    #[test]
    fn extracts_quoted_description() {
        let fm = "description: \"Drive canvas via CLI\"\n";
        assert_eq!(
            extract_from_frontmatter(fm, "description").as_deref(),
            Some("Drive canvas via CLI")
        );
    }

    #[test]
    fn extracts_folded_block_scalar_description() {
        let fm = "name: atmos-canvas-agent\ndescription: >-\n  Drive the user's open Atmos Canvas via CLI:\n  diagrams, layout, and screenshots.\nlicense: MIT\n";
        assert_eq!(
            extract_from_frontmatter(fm, "description").as_deref(),
            Some("Drive the user's open Atmos Canvas via CLI: diagrams, layout, and screenshots.")
        );
    }

    #[test]
    fn extracts_literal_block_scalar_description() {
        let fm = "description: |\n  line one\n  line two\n";
        assert_eq!(
            extract_from_frontmatter(fm, "description").as_deref(),
            Some("line one\nline two")
        );
    }

    #[test]
    fn extract_description_prefers_frontmatter_over_body() {
        let content = "---\nname: x\ndescription: >-\n  Folded frontmatter desc\n  continues here.\n---\n\n# Title\n\nBody paragraph should not win.\n";
        assert_eq!(
            extract_description(content),
            "Folded frontmatter desc continues here."
        );
    }
}
