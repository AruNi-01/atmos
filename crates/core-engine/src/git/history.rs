//! Topological commit history for the center-tab graph.
//!
//! Walk and ref collection follow Comet (https://github.com/zeronsh/comet, MIT —
//! see root NOTICE): `git log --topo-order` seeded by HEAD, branches, remotes,
//! and tags, plus `for-each-ref` (skipping symbolic refs).

use std::collections::HashMap;
use std::path::Path;

use super::{try_run_git, GitEngine};
use crate::error::Result;
use crate::git::types::{HistoryCommit, HistoryPage, HistoryRef, HistoryRefKind};

const GIT_HISTORY_MAX_LIMIT: usize = 200;

impl GitEngine {
    /// Public commit history in topological order. Branches, remotes, and tags
    /// seed the walk so the graph can show merges, not just the current branch.
    pub fn get_commit_history(
        &self,
        repo_path: &Path,
        cursor: usize,
        limit: usize,
    ) -> Result<HistoryPage> {
        let limit = limit.clamp(1, GIT_HISTORY_MAX_LIMIT);
        let head_sha = try_run_git(repo_path, &["rev-parse", "--verify", "HEAD^{commit}"])?
            .map(|sha| sha.trim().to_string())
            .filter(|sha| !sha.is_empty());

        let refs_out = try_run_git(
            repo_path,
            &[
                "for-each-ref",
                "--format=%(refname)%00%(objectname)%00%(objecttype)%00%(*objectname)%00%(*objecttype)%00%(symref)%00",
                "refs/heads",
                "refs/remotes",
                "refs/tags",
            ],
        )?
        .unwrap_or_default();
        let refs_by_sha = parse_history_refs(&refs_out);

        if head_sha.is_none() && refs_by_sha.is_empty() {
            return Ok(HistoryPage {
                commits: Vec::new(),
                head_sha: None,
                next_cursor: None,
                total_count: Some(0),
                head_commit_count: Some(0),
            });
        }

        let skip = format!("--skip={cursor}");
        let max_count = format!("--max-count={}", limit + 1);
        let mut log_args = vec![
            "log",
            "--topo-order",
            "--no-color",
            "--no-decorate",
            "--no-show-signature",
            "--no-patch",
            skip.as_str(),
            max_count.as_str(),
            "--format=%H%x00%P%x00%s%x00%an%x00%ae%x00%at%x00",
        ];
        if head_sha.is_some() {
            log_args.push("HEAD");
        }
        log_args.extend(["--branches", "--remotes", "--tags"]);

        let log = try_run_git(repo_path, &log_args)?.unwrap_or_default();
        let mut commits = parse_history_log(&log, &refs_by_sha);
        let has_next = commits.len() > limit;
        commits.truncate(limit);

        let total_count = if cursor == 0 {
            let mut count_args = vec!["rev-list", "--count"];
            if head_sha.is_some() {
                count_args.push("HEAD");
            }
            count_args.extend(["--branches", "--remotes", "--tags"]);
            try_run_git(repo_path, &count_args)?
                .and_then(|count| count.trim().parse().ok())
        } else {
            None
        };
        let head_commit_count = if cursor == 0 && head_sha.is_some() {
            try_run_git(repo_path, &["rev-list", "--count", "HEAD"])?
                .and_then(|count| count.trim().parse().ok())
        } else {
            None
        };

        Ok(HistoryPage {
            next_cursor: has_next.then_some(cursor + commits.len()),
            commits,
            head_sha,
            total_count,
            head_commit_count,
        })
    }
}

fn bounded_field(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn parse_history_log(
    output: &str,
    refs_by_sha: &HashMap<String, Vec<HistoryRef>>,
) -> Vec<HistoryCommit> {
    let fields: Vec<&str> = output.split('\0').collect();
    fields
        .chunks(6)
        .filter_map(|record| {
            if record.len() != 6 {
                return None;
            }
            let hash = record[0].trim_start_matches(['\r', '\n']).trim();
            if hash.is_empty() || hash.len() < 7 {
                return None;
            }
            Some(HistoryCommit {
                short_hash: hash[..7].to_string(),
                hash: hash.to_string(),
                parent_hashes: record[1]
                    .split_ascii_whitespace()
                    .map(str::to_string)
                    .collect(),
                subject: bounded_field(record[2], 4_096),
                author_name: bounded_field(record[3], 512),
                author_email: bounded_field(record[4], 512),
                timestamp: record[5].trim().parse().unwrap_or(0),
                refs: refs_by_sha.get(hash).cloned().unwrap_or_default(),
            })
        })
        .collect()
}

fn parse_history_refs(output: &str) -> HashMap<String, Vec<HistoryRef>> {
    let fields: Vec<&str> = output.split('\0').collect();
    let mut refs_by_sha: HashMap<String, Vec<HistoryRef>> = HashMap::new();
    for record in fields.chunks(6) {
        if record.len() != 6 {
            continue;
        }
        let full_name = record[0].trim_start_matches(['\r', '\n']);
        let object_sha = record[1];
        let object_type = record[2];
        let peeled_sha = record[3];
        let peeled_type = record[4];
        let symbolic_target = record[5];
        if full_name.is_empty() || !symbolic_target.is_empty() {
            continue;
        }
        let Some((kind, label)) = (if let Some(label) = full_name.strip_prefix("refs/heads/") {
            Some((HistoryRefKind::Branch, label))
        } else if let Some(label) = full_name.strip_prefix("refs/remotes/") {
            Some((HistoryRefKind::Remote, label))
        } else {
            full_name
                .strip_prefix("refs/tags/")
                .map(|label| (HistoryRefKind::Tag, label))
        }) else {
            continue;
        };
        let target_sha = if object_type == "commit" {
            object_sha
        } else if object_type == "tag" && peeled_type == "commit" {
            peeled_sha
        } else {
            continue;
        };
        refs_by_sha
            .entry(target_sha.to_string())
            .or_default()
            .push(HistoryRef {
                kind,
                label: bounded_field(label, 1_024),
            });
    }
    for refs in refs_by_sha.values_mut() {
        refs.sort_by(|left, right| {
            let order = |kind| match kind {
                HistoryRefKind::Branch => 0,
                HistoryRefKind::Tag => 1,
                HistoryRefKind::Remote => 2,
            };
            order(left.kind)
                .cmp(&order(right.kind))
                .then_with(|| left.label.cmp(&right.label))
        });
    }
    refs_by_sha
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_history_log_splits_null_records() {
        let output = "aaaaaaa1\0bbbbbbb2 ccccccc3\0merge\0Ada\0ada@example.com\01720000000\0bbbbbbb2\0ddddddd4\0main\0Ada\0ada@example.com\01710000000\0";
        let mut refs = HashMap::new();
        refs.insert(
            "aaaaaaa1".to_string(),
            vec![HistoryRef {
                kind: HistoryRefKind::Branch,
                label: "main".into(),
            }],
        );
        let commits = parse_history_log(output, &refs);
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].hash, "aaaaaaa1");
        assert_eq!(
            commits[0].parent_hashes,
            vec!["bbbbbbb2".to_string(), "ccccccc3".to_string()]
        );
        assert_eq!(commits[0].refs[0].label, "main");
        assert_eq!(commits[1].subject, "main");
        assert_eq!(commits[1].timestamp, 17_100_000_00);
    }

    #[test]
    fn parse_history_refs_skips_symbolic_and_sorts_kinds() {
        let output = [
            "refs/heads/main",
            "abc123",
            "commit",
            "",
            "",
            "",
            "refs/remotes/origin/HEAD",
            "abc123",
            "commit",
            "",
            "",
            "refs/remotes/origin/main",
            "refs/remotes/origin/main",
            "abc123",
            "commit",
            "",
            "",
            "",
            "refs/tags/v1",
            "abc123",
            "commit",
            "",
            "",
            "",
            "",
        ]
        .join("\0");
        let refs = parse_history_refs(&output);
        let attached = refs.get("abc123").expect("sha should have refs");
        assert_eq!(
            attached
                .iter()
                .map(|item| (item.kind, item.label.as_str()))
                .collect::<Vec<_>>(),
            vec![
                (HistoryRefKind::Branch, "main"),
                (HistoryRefKind::Tag, "v1"),
                (HistoryRefKind::Remote, "origin/main"),
            ]
        );
    }
}
