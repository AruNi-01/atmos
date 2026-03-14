//! Content search engine using ripgrep-like functionality.

use std::path::Path;
use std::process::Command;

use crate::EngineError;

/// Search match result
#[derive(Debug, Clone)]
pub struct SearchMatch {
    pub file_path: String,
    pub line_number: usize,
    pub line_content: String,
    pub match_start: usize,
    pub match_end: usize,
    pub context_before: Vec<String>,
    pub context_after: Vec<String>,
}

/// Search result
#[derive(Debug)]
pub struct SearchResult {
    pub matches: Vec<SearchMatch>,
    pub truncated: bool,
}

/// Search for content in files using rg (ripgrep) command
pub fn search_content(
    root_path: &Path,
    query: &str,
    max_results: usize,
    case_sensitive: bool,
) -> Result<SearchResult, EngineError> {
    if query.is_empty() {
        return Ok(SearchResult {
            matches: vec![],
            truncated: false,
        });
    }

    let mut cmd = Command::new("rg");
    cmd.arg("--json")
        .arg("--context")
        .arg("2")
        .arg("--max-count")
        .arg(max_results.to_string())
        .arg("--max-columns")
        .arg("500")
        .arg("--max-columns-preview");

    if !case_sensitive {
        cmd.arg("--ignore-case");
    }

    cmd.arg("--glob")
        .arg("!.git")
        .arg("--glob")
        .arg("!node_modules")
        .arg("--glob")
        .arg("!target")
        .arg("--glob")
        .arg("!dist")
        .arg("--glob")
        .arg("!build")
        .arg("--glob")
        .arg("!.next")
        .arg("--glob")
        .arg("!*.lock");

    cmd.arg("--").arg(query).arg(".");
    cmd.current_dir(root_path);

    let output = cmd.output().map_err(|e| {
        EngineError::Search(format!(
            "Failed to execute rg: {}. Is ripgrep installed?",
            e
        ))
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut matches = Vec::new();
    let mut count = 0;
    let mut hit_limit = false;

    use std::collections::HashMap;
    let mut all_lines: HashMap<String, HashMap<usize, String>> = HashMap::new();
    let mut match_protos = Vec::new();

    for line in stdout.lines() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            let msg_type = json["type"].as_str().unwrap_or("");
            if msg_type == "match" || msg_type == "context" {
                if let Some(data) = json.get("data") {
                    let file_path = data["path"]["text"]
                        .as_str()
                        .unwrap_or("")
                        .trim_start_matches("./")
                        .to_string();
                    let line_number = data["line_number"].as_u64().unwrap_or(0) as usize;
                    let line_content = data["lines"]["text"]
                        .as_str()
                        .unwrap_or("")
                        .trim_end()
                        .to_string();

                    all_lines
                        .entry(file_path.clone())
                        .or_default()
                        .insert(line_number, line_content.clone());

                    if msg_type == "match" {
                        if count < max_results {
                            let (match_start, match_end) =
                                if let Some(submatches) = data["submatches"].as_array() {
                                    if let Some(first) = submatches.first() {
                                        (
                                            first["start"].as_u64().unwrap_or(0) as usize,
                                            first["end"].as_u64().unwrap_or(0) as usize,
                                        )
                                    } else {
                                        (0, 0)
                                    }
                                } else {
                                    (0, 0)
                                };

                            match_protos.push((file_path, line_number, match_start, match_end));
                            count += 1;
                        } else {
                            hit_limit = true;
                        }
                    }
                }
            }
        }
    }

    for (file_path, line_number, match_start, match_end) in match_protos {
        if let Some(file_map) = all_lines.get(&file_path) {
            if let Some(line_content) = file_map.get(&line_number) {
                let mut context_before = Vec::new();
                for i in (line_number.saturating_sub(2)..line_number).rev() {
                    if let Some(l) = file_map.get(&i) {
                        context_before.insert(0, l.clone());
                    }
                }

                let mut context_after = Vec::new();
                for i in (line_number + 1)..=(line_number + 2) {
                    if let Some(l) = file_map.get(&i) {
                        context_after.push(l.clone());
                    }
                }

                matches.push(SearchMatch {
                    file_path,
                    line_number,
                    line_content: line_content.clone(),
                    match_start,
                    match_end,
                    context_before,
                    context_after,
                });
            }
        }
    }

    Ok(SearchResult {
        matches,
        truncated: hit_limit,
    })
}
