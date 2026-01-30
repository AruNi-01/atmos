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
        .arg("--max-count")
        .arg(max_results.to_string())
        .arg("--max-columns")
        .arg("500")
        .arg("--max-columns-preview");

    if !case_sensitive {
        cmd.arg("--ignore-case");
    }

    // Ignore common non-code directories
    cmd.arg("--glob").arg("!.git")
        .arg("--glob").arg("!node_modules")
        .arg("--glob").arg("!target")
        .arg("--glob").arg("!dist")
        .arg("--glob").arg("!build")
        .arg("--glob").arg("!.next")
        .arg("--glob").arg("!*.lock");

    cmd.arg("--").arg(query).arg(".");
    cmd.current_dir(root_path);

    let output = cmd.output().map_err(|e| {
        EngineError::Search(format!("Failed to execute rg: {}. Is ripgrep installed?", e))
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut matches = Vec::new();
    let mut count = 0;

    for line in stdout.lines() {
        if count >= max_results {
            return Ok(SearchResult {
                matches,
                truncated: true,
            });
        }

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            if json["type"] == "match" {
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

                    // Get match position from submatches
                    let (match_start, match_end) = if let Some(submatches) = data["submatches"].as_array() {
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

                    matches.push(SearchMatch {
                        file_path,
                        line_number,
                        line_content,
                        match_start,
                        match_end,
                    });
                    count += 1;
                }
            }
        }
    }

    Ok(SearchResult {
        matches,
        truncated: false,
    })
}
