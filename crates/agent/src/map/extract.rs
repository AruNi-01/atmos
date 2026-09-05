use serde_json::{Map, Value};

use crate::contract::{AgentGeneratedImage, SearchHit, WebSearchLink};

const NESTED_WRAPPERS: [&str; 3] = ["args", "parameters", "input"];

fn non_empty_str(value: &Value) -> Option<&str> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn is_http_url(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

fn walk_objects(value: &Value) -> Vec<&Map<String, Value>> {
    let Some(object) = value.as_object() else {
        return Vec::new();
    };
    let mut objects = vec![object];
    for key in NESTED_WRAPPERS {
        if let Some(nested) = object.get(key).and_then(Value::as_object) {
            objects.push(nested);
        }
    }
    objects
}

fn first_string(value: &Value, keys: &[&str]) -> Option<String> {
    for object in walk_objects(value) {
        for key in keys {
            if let Some(text) = object.get(*key).and_then(non_empty_str) {
                return Some(text.to_string());
            }
        }
    }
    None
}

fn first_bool(value: &Value, keys: &[&str]) -> Option<bool> {
    for object in walk_objects(value) {
        for key in keys {
            if let Some(flag) = object.get(*key).and_then(Value::as_bool) {
                return Some(flag);
            }
        }
    }
    None
}

fn first_id(value: &Value, keys: &[&str]) -> Option<String> {
    for object in walk_objects(value) {
        for key in keys {
            match object.get(*key) {
                Some(Value::String(text)) if !text.trim().is_empty() => {
                    return Some(text.trim().to_string());
                }
                Some(Value::Number(number)) => return Some(number.to_string()),
                _ => {}
            }
        }
    }
    None
}

pub fn extract_path(value: &Value) -> Option<String> {
    const KEYS: &[&str] = &[
        "file_path",
        "filePath",
        "notebook_path",
        "notebookPath",
        "target_file",
        "targetFile",
        "absolute_path",
        "absolute_root_path",
        "target_directory",
        "targetDirectory",
        "directory",
        "dir",
        "path",
        "file",
        "filename",
        "uri",
        "dir_path",
    ];
    for object in walk_objects(value) {
        for key in KEYS {
            let Some(text) = object.get(*key).and_then(non_empty_str) else {
                continue;
            };
            if *key == "uri" && is_http_url(text) {
                continue;
            }
            return Some(text.to_string());
        }
    }
    None
}

pub fn extract_command(value: &Value) -> Option<String> {
    first_string(value, &["command", "cmd", "script", "bash", "shell"])
}

pub fn extract_url(value: &Value) -> Option<String> {
    const KEYS: &[&str] = &["url", "uri", "href"];
    for object in walk_objects(value) {
        for key in KEYS {
            if let Some(text) = object.get(*key).and_then(non_empty_str) {
                if is_http_url(text) {
                    return Some(text.to_string());
                }
            }
        }
        if let Some(action) = object.get("action").and_then(Value::as_object) {
            if let Some(text) = action.get("url").and_then(non_empty_str) {
                if is_http_url(text) {
                    return Some(text.to_string());
                }
            }
        }
    }
    None
}

pub fn extract_query(value: &Value) -> Option<String> {
    first_string(
        value,
        &["query", "q", "search_term", "pattern", "glob_pattern"],
    )
}

pub fn extract_cwd(value: &Value) -> Option<String> {
    first_string(value, &["cwd", "working_directory", "workdir"])
}

pub fn extract_links(value: &Value) -> Vec<WebSearchLink> {
    const ARRAY_KEYS: &[&str] = &["links", "results", "sources"];
    for object in walk_objects(value) {
        for key in ARRAY_KEYS {
            let Some(items) = object.get(*key).and_then(Value::as_array) else {
                continue;
            };
            let links: Vec<WebSearchLink> = items.iter().filter_map(parse_link).collect();
            if !links.is_empty() {
                return links;
            }
        }
    }
    // OpenCode Exa/Parallel websearch often returns a bare "Title:/URL:" text blob.
    // Claude (DeepSeek) sometimes embeds `Links: [{...}]` JSON inside a plain string.
    match value {
        Value::String(text) => {
            let links = parse_links_json_blob(text);
            if !links.is_empty() {
                return links;
            }
            parse_title_url_blocks(text)
        }
        Value::Object(map) => {
            for key in ["text", "output", "content", "body", "markdown"] {
                if let Some(text) = map.get(key).and_then(non_empty_str) {
                    let links = parse_links_json_blob(text);
                    if !links.is_empty() {
                        return links;
                    }
                    let links = parse_title_url_blocks(text);
                    if !links.is_empty() {
                        return links;
                    }
                }
            }
            Vec::new()
        }
        _ => Vec::new(),
    }
}

/// Claude stream-json WebSearch stdout: `…\nLinks: [{"title":…,"url":…},…]`.
fn parse_links_json_blob(text: &str) -> Vec<WebSearchLink> {
    let lower = text.to_ascii_lowercase();
    if !lower.contains("links:") && !text.trim_start().starts_with('[') {
        return Vec::new();
    }
    let Some(start) = text.find('[') else {
        return Vec::new();
    };
    let slice = &text[start..];
    let mut depth = 0i32;
    let mut end = None;
    for (idx, ch) in slice.char_indices() {
        match ch {
            '[' => depth += 1,
            ']' => {
                depth -= 1;
                if depth == 0 {
                    end = Some(idx);
                    break;
                }
            }
            _ => {}
        }
    }
    let Some(end) = end else {
        return Vec::new();
    };
    let Ok(Value::Array(items)) = serde_json::from_str::<Value>(&slice[..=end]) else {
        return Vec::new();
    };
    items.iter().filter_map(parse_link).collect()
}

/// Parse Exa-style blocks: `Title: …\nURL: https://…` separated by `---`.
fn parse_title_url_blocks(text: &str) -> Vec<WebSearchLink> {
    let mut links = Vec::new();
    let mut title: Option<String> = None;
    let mut url: Option<String> = None;
    let mut snippet_lines: Vec<String> = Vec::new();

    let flush = |title: &mut Option<String>,
                 url: &mut Option<String>,
                 snippet_lines: &mut Vec<String>,
                 links: &mut Vec<WebSearchLink>| {
        if let Some(url_value) = url.take() {
            let title_value = title.take().unwrap_or_default();
            let snippet = {
                let joined = snippet_lines
                    .iter()
                    .map(|line| line.trim())
                    .filter(|line| !line.is_empty())
                    .take(3)
                    .collect::<Vec<_>>()
                    .join(" ");
                snippet_lines.clear();
                if joined.is_empty() {
                    None
                } else {
                    Some(joined)
                }
            };
            links.push(WebSearchLink {
                url: url_value,
                title: title_value,
                snippet,
            });
        } else {
            *title = None;
            snippet_lines.clear();
        }
    };

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed == "---" {
            flush(&mut title, &mut url, &mut snippet_lines, &mut links);
            continue;
        }
        if let Some(rest) = trimmed
            .strip_prefix("Title:")
            .or_else(|| trimmed.strip_prefix("title:"))
        {
            if url.is_some() {
                flush(&mut title, &mut url, &mut snippet_lines, &mut links);
            }
            title = Some(rest.trim().to_string());
            continue;
        }
        if let Some(rest) = trimmed
            .strip_prefix("URL:")
            .or_else(|| trimmed.strip_prefix("Url:"))
            .or_else(|| trimmed.strip_prefix("url:"))
        {
            let candidate = rest.trim();
            if is_http_url(candidate) {
                url = Some(candidate.to_string());
            }
            continue;
        }
        if trimmed.starts_with("Published:")
            || trimmed.starts_with("Author:")
            || trimmed.eq_ignore_ascii_case("Highlights:")
        {
            continue;
        }
        if title.is_some() || url.is_some() {
            snippet_lines.push(trimmed.to_string());
        }
    }
    flush(&mut title, &mut url, &mut snippet_lines, &mut links);
    links
}

pub fn extract_search_hits(value: &Value) -> Vec<SearchHit> {
    if looks_like_web_search(value) {
        return Vec::new();
    }
    parse_search_hit_lines(&collect_search_text(value))
}

fn looks_like_web_search(value: &Value) -> bool {
    if !extract_links(value).is_empty() {
        return true;
    }
    for object in walk_objects(value) {
        if object.get("type").and_then(non_empty_str) == Some("web_search") {
            return true;
        }
    }
    false
}

fn collect_search_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .map(collect_search_text)
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(map) => {
            for key in [
                "matches",
                "files",
                "paths",
                "locations",
                "hits",
                "text",
                "output",
                "content",
                "stdout",
                "result",
                "message",
            ] {
                if let Some(nested) = map.get(key) {
                    let text = collect_search_text(nested);
                    if !text.is_empty() {
                        return text;
                    }
                }
            }
            extract_path(&Value::Object(map.clone())).unwrap_or_default()
        }
        _ => String::new(),
    }
}

fn parse_search_hit_lines(text: &str) -> Vec<SearchHit> {
    text.lines().filter_map(parse_search_hit_line).collect()
}

fn parse_search_hit_line(line: &str) -> Option<SearchHit> {
    let line = line.trim();
    if line.is_empty() || is_http_url(line) || is_search_summary_line(line) {
        return None;
    }
    if let Some(hit) = parse_grep_line(line) {
        if is_http_url(&hit.path) {
            return None;
        }
        return Some(hit);
    }
    Some(SearchHit {
        path: line.to_string(),
        line: None,
        snippet: None,
    })
}

/// Vendor grep footers like "found 5 matches" must not become fake hit paths.
fn is_search_summary_line(line: &str) -> bool {
    let lower = line.trim().to_ascii_lowercase();
    if lower.is_empty() {
        return false;
    }
    let has_match_word = lower.contains("match");
    if !has_match_word {
        return false;
    }
    lower.starts_with("found ")
        || lower.starts_with("no matches")
        || lower.ends_with(" matches")
        || lower.ends_with(" match")
        || lower.contains("matches found")
        || lower.contains("match found")
}

fn parse_grep_line(line: &str) -> Option<SearchHit> {
    for (colon, _) in line.match_indices(':') {
        let after = &line[colon + 1..];
        let digit_end = after.chars().take_while(|ch| ch.is_ascii_digit()).count();
        if digit_end == 0 {
            continue;
        }
        let Ok(line_no) = after[..digit_end].parse::<u32>() else {
            continue;
        };
        let rest = &after[digit_end..];
        let path = line[..colon].to_string();
        if path.is_empty() {
            continue;
        }
        if rest.is_empty() {
            return Some(SearchHit {
                path,
                line: Some(line_no),
                snippet: None,
            });
        }
        if let Some(snippet) = rest.strip_prefix(':') {
            return Some(SearchHit {
                path,
                line: Some(line_no),
                snippet: if snippet.is_empty() {
                    None
                } else {
                    Some(snippet.to_string())
                },
            });
        }
    }
    None
}

fn parse_link(value: &Value) -> Option<WebSearchLink> {
    let object = value.as_object()?;
    let url = object.get("url").and_then(non_empty_str)?.to_string();
    let title = object
        .get("title")
        .and_then(non_empty_str)
        .unwrap_or("")
        .to_string();
    let snippet = object
        .get("snippet")
        .or_else(|| object.get("description"))
        .and_then(non_empty_str)
        .map(str::to_string);
    Some(WebSearchLink {
        url,
        title,
        snippet,
    })
}

pub fn extract_background(value: &Value) -> bool {
    first_bool(value, &["run_in_background", "is_background", "background"]).unwrap_or(false)
}

pub fn extract_task_id(value: &Value) -> Option<String> {
    if let Some(id) = first_id(value, &["task_id", "taskId"]) {
        return Some(id);
    }
    for object in walk_objects(value) {
        if let Some(items) = object.get("task_ids").and_then(Value::as_array) {
            for item in items {
                match item {
                    Value::String(text) if !text.trim().is_empty() => {
                        return Some(text.trim().to_string());
                    }
                    Value::Number(number) => return Some(number.to_string()),
                    _ => {}
                }
            }
        }
    }
    None
}

pub fn extract_skill(value: &Value) -> Option<String> {
    first_string(value, &["skill", "skill_name", "name"])
}

pub fn extract_subagent(value: &Value) -> Option<(String, Option<String>)> {
    let description = first_string(value, &["description"])?;
    let agent_type = first_string(value, &["subagent_type", "agent_type"]);
    Some((description, agent_type))
}

pub fn extract_image_prompt(value: &Value) -> Option<String> {
    first_string(
        value,
        &["prompt", "description", "text", "caption", "query"],
    )
}

pub fn extract_aspect_ratio(value: &Value) -> Option<String> {
    first_string(value, &["aspect_ratio", "aspectRatio", "ratio"])
}

pub fn extract_image_size(value: &Value) -> Option<String> {
    first_string(value, &["size", "resolution", "dimensions"])
}

pub fn extract_reference_paths(value: &Value) -> Option<Vec<String>> {
    for object in walk_objects(value) {
        for key in [
            "reference_image_paths",
            "referenceImagePaths",
            "reference_paths",
            "references",
        ] {
            if let Some(paths) = object.get(key).and_then(string_list) {
                if !paths.is_empty() {
                    return Some(paths);
                }
            }
        }
        // Grok image_edit: `image` may be a path string or array of paths/data URLs.
        if let Some(paths) = object.get("image").and_then(string_list) {
            if !paths.is_empty() {
                return Some(paths);
            }
        }
        if let Some(text) = object.get("image").and_then(non_empty_str) {
            return Some(vec![text.to_string()]);
        }
    }
    None
}

fn string_list(value: &Value) -> Option<Vec<String>> {
    match value {
        Value::Array(items) => {
            let paths: Vec<String> = items
                .iter()
                .filter_map(|item| {
                    non_empty_str(item)
                        .map(str::to_string)
                        .or_else(|| item.get("path").and_then(non_empty_str).map(str::to_string))
                        .or_else(|| item.get("url").and_then(non_empty_str).map(str::to_string))
                })
                .collect();
            (!paths.is_empty()).then_some(paths)
        }
        Value::String(text) if !text.trim().is_empty() => Some(vec![text.trim().to_string()]),
        _ => None,
    }
}

/// Collect generated/edited image refs from vendor output (paths, URLs, data:, markdown).
pub fn extract_generated_images(value: &Value) -> Vec<AgentGeneratedImage> {
    let mut images = Vec::new();
    collect_generated_images(value, &mut images);
    // Dedup by path/url while preserving order.
    let mut seen = std::collections::HashSet::new();
    images.retain(|image| {
        let key = format!(
            "{}|{}",
            image.path.as_deref().unwrap_or(""),
            image.url.as_deref().unwrap_or("")
        );
        seen.insert(key)
    });
    images
}

fn collect_generated_images(value: &Value, out: &mut Vec<AgentGeneratedImage>) {
    match value {
        Value::String(text) => push_image_from_text(text, out),
        Value::Array(items) => {
            for item in items {
                collect_generated_images(item, out);
            }
        }
        Value::Object(map) => {
            for key in ["images", "results", "files", "outputs", "media"] {
                if let Some(nested) = map.get(key) {
                    collect_generated_images(nested, out);
                }
            }
            let path = [
                "path",
                "file",
                "file_path",
                "filePath",
                "filename",
                "output_path",
                "outputPath",
                "image_path",
                "imagePath",
            ]
            .iter()
            .find_map(|key| map.get(*key).and_then(non_empty_str))
            .map(str::to_string);
            let url = ["url", "image_url", "imageUrl", "src", "href", "uri"]
                .iter()
                .find_map(|key| map.get(*key).and_then(non_empty_str))
                .map(str::to_string);
            let mime = ["mime", "mime_type", "mimeType", "media_type", "mediaType"]
                .iter()
                .find_map(|key| map.get(*key).and_then(non_empty_str))
                .map(str::to_string);
            // Cursor GenerateImage proto uses `image_data`; OpenAI-style uses b64_json.
            let b64 = ["base64", "b64_json", "image_data", "imageData", "data"]
                .iter()
                .find_map(|key| map.get(*key).and_then(non_empty_str));
            if let Some(b64) = b64 {
                if looks_like_base64(b64) && !b64.starts_with("data:") {
                    let mime = mime.clone().unwrap_or_else(|| "image/png".into());
                    out.push(AgentGeneratedImage {
                        url: Some(format!("data:{mime};base64,{b64}")),
                        path: path.clone(),
                        mime: Some(mime),
                    });
                } else if b64.starts_with("data:image/") {
                    out.push(AgentGeneratedImage {
                        url: Some(b64.to_string()),
                        path: path.clone(),
                        mime,
                    });
                }
            } else if path.is_some() || url.as_ref().is_some_and(|u| is_image_src(u)) {
                out.push(AgentGeneratedImage { url, path, mime });
            } else if let Some(image) = map.get("image") {
                collect_generated_images(image, out);
            }
            for key in ["text", "content", "markdown", "output", "result"] {
                if let Some(text) = map.get(key).and_then(non_empty_str) {
                    push_image_from_text(text, out);
                }
            }
        }
        _ => {}
    }
}

fn push_image_from_text(text: &str, out: &mut Vec<AgentGeneratedImage>) {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return;
    }
    if is_image_src(trimmed) || looks_like_image_path(trimmed) {
        if is_http_url(trimmed) || trimmed.starts_with("data:image/") {
            out.push(AgentGeneratedImage {
                url: Some(trimmed.to_string()),
                path: None,
                mime: None,
            });
        } else {
            out.push(AgentGeneratedImage {
                url: None,
                path: Some(trimmed.to_string()),
                mime: None,
            });
        }
    }
    // Markdown images: ![alt](src)
    for cap in markdown_image_srcs(trimmed) {
        if is_http_url(&cap) || cap.starts_with("data:image/") {
            out.push(AgentGeneratedImage {
                url: Some(cap),
                path: None,
                mime: None,
            });
        } else if looks_like_image_path(&cap) {
            out.push(AgentGeneratedImage {
                url: None,
                path: Some(cap),
                mime: None,
            });
        }
    }
}

fn markdown_image_srcs(text: &str) -> Vec<String> {
    let mut srcs = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    while i + 4 < bytes.len() {
        if bytes[i] == b'!' && bytes[i + 1] == b'[' {
            if let Some(close) = text[i + 2..].find(']') {
                let after = i + 2 + close + 1;
                if after < bytes.len() && bytes[after] == b'(' {
                    if let Some(end) = text[after + 1..].find(')') {
                        let src = text[after + 1..after + 1 + end].trim();
                        if !src.is_empty() {
                            srcs.push(src.to_string());
                        }
                        i = after + 1 + end + 1;
                        continue;
                    }
                }
            }
        }
        i += 1;
    }
    srcs
}

fn is_image_src(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("data:image/")
}

fn looks_like_image_path(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    if lower.is_empty() || lower.contains(' ') && !lower.contains('/') {
        return false;
    }
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.ends_with(".svg")
        || lower.ends_with(".bmp")
        || lower.ends_with(".avif")
        || lower.ends_with(".tiff")
        || lower.ends_with(".tif")
}

fn looks_like_base64(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() > 32
        && trimmed
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/' || b == b'=')
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contract::AgentToolKind;
    use crate::contract::{
        AgentTool, AgentToolParams, AgentToolResult, AgentToolStatus, SearchHit,
    };

    fn json_keys(value: &Value) -> Vec<&str> {
        value
            .as_object()
            .map(|object| object.keys().map(String::as_str).collect())
            .unwrap_or_default()
    }

    #[test]
    fn extract_path_prefers_vendor_file_keys() {
        assert_eq!(
            extract_path(&serde_json::json!({"file_path": "src/lib.rs", "path": "other.rs"})),
            Some("src/lib.rs".into())
        );
        assert_eq!(
            extract_path(&serde_json::json!({"uri": "https://example.com/page"})),
            None
        );
        assert_eq!(
            extract_path(&serde_json::json!({"uri": "/tmp/notes.md"})),
            Some("/tmp/notes.md".into())
        );
        assert_eq!(
            extract_path(&serde_json::json!({
                "variant": "ListDir",
                "target_directory": "/Users/aarynlu/OpenSource/atmos/tmp"
            })),
            Some("/Users/aarynlu/OpenSource/atmos/tmp".into())
        );
        assert_eq!(
            extract_path(&serde_json::json!({
                "notebook_path": "/tmp/demo.ipynb",
                "cell_id": "c1"
            })),
            Some("/tmp/demo.ipynb".into())
        );
        assert_eq!(
            extract_path(&serde_json::json!({
                "absolute_root_path": "/tmp",
                "content": "- /tmp/\n  - a.txt"
            })),
            Some("/tmp".into())
        );
    }

    #[test]
    fn extract_command_unifies_bash_shapes() {
        assert_eq!(
            extract_command(&serde_json::json!({"command": "ls -la"})),
            Some("ls -la".into())
        );
        assert_eq!(
            extract_command(&serde_json::json!({"type": "Bash", "command": "ls -la"})),
            Some("ls -la".into())
        );
        assert_eq!(
            extract_command(&serde_json::json!({"input": {"cmd": "pwd"}})),
            Some("pwd".into())
        );
    }

    #[test]
    fn extract_url_and_query_and_links() {
        assert_eq!(
            extract_url(&serde_json::json!({"url": "https://example.com/page"})),
            Some("https://example.com/page".into())
        );
        assert_eq!(
            extract_url(&serde_json::json!({"action": {"url": "https://example.com/from-action"}})),
            Some("https://example.com/from-action".into())
        );
        assert_eq!(
            extract_query(&serde_json::json!({"pattern": "AgentTool", "path": "crates/agent"})),
            Some("AgentTool".into())
        );
        assert_eq!(
            extract_path(&serde_json::json!({"pattern": "AgentTool", "path": "crates/agent"})),
            Some("crates/agent".into())
        );
        let links = extract_links(&serde_json::json!({
            "sources": [{
                "url": "https://example.com",
                "title": "Example",
                "description": "Snippet"
            }]
        }));
        assert_eq!(
            links,
            vec![WebSearchLink {
                url: "https://example.com".into(),
                title: "Example".into(),
                snippet: Some("Snippet".into()),
            }]
        );
    }

    #[test]
    fn extract_links_from_exa_title_url_text() {
        let text = "Title: OpenCode Home\nURL: https://opencode.ai/\nHighlights:\nHello\n\n---\n\nTitle: GitHub\nURL: https://github.com/anomalyco/opencode\nPublished: N/A\n";
        let links = extract_links(&serde_json::Value::String(text.into()));
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].url, "https://opencode.ai/");
        assert_eq!(links[0].title, "OpenCode Home");
        assert_eq!(links[1].url, "https://github.com/anomalyco/opencode");
        assert_eq!(links[1].title, "GitHub");
    }

    #[test]
    fn extract_links_from_claude_links_json_blob() {
        let text = "Web search results for query: \"Atmos agent chat ACP\"\n\nLinks: [{\"title\":\"Atmos AI | atmos\",\"url\":\"https://atmos.tools/ai#mcp\"},{\"title\":\"Changelog\",\"url\":\"https://atmos-pro.com/changelog\"}]\n\nMore prose.";
        let links = extract_links(&serde_json::Value::String(text.into()));
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].url, "https://atmos.tools/ai#mcp");
        assert_eq!(links[0].title, "Atmos AI | atmos");
        assert_eq!(links[1].url, "https://atmos-pro.com/changelog");
    }

    #[test]
    fn unknown_tool_serializes_without_bag_fields() {
        let tool = AgentTool {
            tool_call_id: "tc_x".into(),
            name: "vendor_mystery".into(),
            title: None,
            kind: AgentToolKind::Other,
            status: AgentToolStatus::Completed,
            params: AgentToolParams::Other {
                value: serde_json::json!({"opaque": true}),
            },
            result: Some(AgentToolResult::Other {
                value: serde_json::json!({"n": 1}),
            }),
        };
        let json = serde_json::to_value(&tool).expect("serialize");
        let keys = json_keys(&json);
        assert!(!keys.contains(&"input"));
        assert!(!keys.contains(&"output"));
        assert!(!keys.contains(&"content"));
        assert!(!keys.contains(&"native"));
        assert_eq!(json["kind"], "other");
        assert_eq!(json["params"]["type"], "other");
        assert_eq!(json["params"]["value"], serde_json::json!({"opaque": true}));
        assert_eq!(json["result"]["type"], "other");
        assert_eq!(json["result"]["value"], serde_json::json!({"n": 1}));
    }

    #[test]
    fn mapped_web_search_and_workspace_search_keep_aligned_types() {
        let web = AgentTool {
            tool_call_id: "tc_web".into(),
            name: "web_search".into(),
            title: None,
            kind: AgentToolKind::WebSearch,
            status: AgentToolStatus::Completed,
            params: AgentToolParams::WebSearch {
                query: "atmos acp".into(),
            },
            result: Some(AgentToolResult::WebSearch {
                query: "atmos acp".into(),
                links: extract_links(&serde_json::json!({
                    "links": [{ "url": "https://example.com", "title": "Example" }]
                })),
            }),
        };
        let web_json = serde_json::to_value(&web).expect("serialize");
        assert_eq!(web_json["kind"], "web_search");
        assert_eq!(web_json["params"]["type"], "web_search");
        assert_eq!(web_json["result"]["type"], "web_search");

        let search = AgentTool {
            tool_call_id: "tc_grep".into(),
            name: "Grep".into(),
            title: None,
            kind: AgentToolKind::Search,
            status: AgentToolStatus::Completed,
            params: AgentToolParams::Search {
                query: "AgentTool".into(),
                path: Some("crates/agent".into()),
                glob: None,
            },
            result: Some(AgentToolResult::Text {
                text: "tool.rs:12: pub struct AgentTool".into(),
            }),
        };
        let search_json = serde_json::to_value(&search).expect("serialize");
        assert_eq!(search_json["kind"], "search");
        assert_eq!(search_json["params"]["type"], "search");
        assert_ne!(search_json["kind"], "web_search");
    }

    #[test]
    fn app069_s1_extract_search_hits_parses_grep_and_glob_lines() {
        let hits = extract_search_hits(&serde_json::json!(
            "crates/agent/src/lib.rs:12: pub struct AgentTool\ncrates/agent/src/tool.rs:40:\nsrc/**/*.rs"
        ));
        assert_eq!(
            hits,
            vec![
                SearchHit {
                    path: "crates/agent/src/lib.rs".into(),
                    line: Some(12),
                    snippet: Some(" pub struct AgentTool".into()),
                },
                SearchHit {
                    path: "crates/agent/src/tool.rs".into(),
                    line: Some(40),
                    snippet: None,
                },
                SearchHit {
                    path: "src/**/*.rs".into(),
                    line: None,
                    snippet: None,
                },
            ]
        );
    }

    #[test]
    fn extract_search_hits_from_matches_and_path_objects() {
        let from_matches = extract_search_hits(&serde_json::json!({
            "matches": ["apps/api/src/main.rs", "crates/agent/Cargo.toml"]
        }));
        assert_eq!(from_matches.len(), 2);
        assert_eq!(from_matches[0].path, "apps/api/src/main.rs");

        let from_files = extract_search_hits(&serde_json::json!({
            "files": [{ "path": "src/lib.rs" }, { "file_path": "src/main.rs" }]
        }));
        assert_eq!(
            from_files
                .iter()
                .map(|hit| hit.path.as_str())
                .collect::<Vec<_>>(),
            vec!["src/lib.rs", "src/main.rs"]
        );
    }

    #[test]
    fn app069_s2_extract_search_hits_zero_and_web_search_stay_empty() {
        assert!(extract_search_hits(&serde_json::json!("")).is_empty());
        assert!(extract_search_hits(&serde_json::json!({})).is_empty());
        assert!(extract_search_hits(&serde_json::json!({
            "links": [{ "url": "https://example.com", "title": "Example" }],
            "text": "src/lib.rs:1:should not become a workspace hit"
        }))
        .is_empty());
        assert!(extract_search_hits(&serde_json::json!({
            "type": "web_search",
            "text": "src/lib.rs:1:nope"
        }))
        .is_empty());
    }

    #[test]
    fn extract_search_hits_skips_found_n_matches_summary() {
        assert!(extract_search_hits(&serde_json::json!("found 5 matches")).is_empty());
        assert!(extract_search_hits(&serde_json::json!("No matches found")).is_empty());
        let mixed = extract_search_hits(&serde_json::json!(
            "found 1 match\ntmp/note.md:3: Hello\n1 match found"
        ));
        assert_eq!(
            mixed,
            vec![SearchHit {
                path: "tmp/note.md".into(),
                line: Some(3),
                snippet: Some(" Hello".into()),
            }]
        );
    }

    #[test]
    fn extract_generated_images_from_path_url_and_markdown() {
        let from_path = extract_generated_images(&serde_json::json!({
            "path": "/tmp/out.png"
        }));
        assert_eq!(from_path.len(), 1);
        assert_eq!(from_path[0].path.as_deref(), Some("/tmp/out.png"));

        let from_md = extract_generated_images(&serde_json::json!(
            "done ![shot](https://cdn.example/a.png)"
        ));
        assert_eq!(from_md.len(), 1);
        assert_eq!(from_md[0].url.as_deref(), Some("https://cdn.example/a.png"));

        let from_b64 = extract_generated_images(&serde_json::json!({
            "base64": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            "mime": "image/jpeg"
        }));
        assert_eq!(from_b64.len(), 1);
        assert!(from_b64[0]
            .url
            .as_deref()
            .unwrap_or("")
            .starts_with("data:image/jpeg;base64,"));
    }
}
