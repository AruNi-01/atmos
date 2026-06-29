use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::error::Result;

use super::{run_git, try_run_git, ChangedFileInfo, ChangedFilesInfo, FileDiffInfo, GitEngine};

fn is_unmerged_porcelain_status(status: &str) -> bool {
    matches!(status, "DD" | "AU" | "UD" | "UA" | "DU" | "AA" | "UU")
}

impl GitEngine {
    /// Get list of changed files with additions and deletions count
    /// Categorizes files as staged, unstaged, or untracked
    pub fn get_changed_files(
        &self,
        repo_path: &Path,
        base_branch: Option<&str>,
        use_preferred_compare: bool,
    ) -> Result<ChangedFilesInfo> {
        let status_stdout = run_git(
            repo_path,
            &[
                "-c",
                "core.quotePath=false",
                "status",
                "--porcelain",
                "-uall",
            ],
        )?;

        let compare_ref = if use_preferred_compare
            || base_branch
                .filter(|value| !value.trim().is_empty())
                .is_some()
        {
            self.resolve_preferred_compare_ref(repo_path, base_branch)?
        } else {
            None
        };

        let compare_numstat = if let Some(base_ref) = compare_ref.as_deref() {
            Some(Self::build_numstat_map(
                try_run_git(
                    repo_path,
                    &["-c", "core.quotePath=false", "diff", "--numstat", base_ref],
                )?
                .as_deref(),
            ))
        } else {
            None
        };
        let compare_name_status = if let Some(base_ref) = compare_ref.as_deref() {
            Some(Self::build_name_status_entries(
                try_run_git(
                    repo_path,
                    &[
                        "-c",
                        "core.quotePath=false",
                        "diff",
                        "--name-status",
                        base_ref,
                    ],
                )?
                .as_deref(),
            ))
        } else {
            None
        };

        let (staged_numstat, unstaged_numstat) = if let Some(compare_numstat) = compare_numstat {
            (compare_numstat, HashMap::new())
        } else {
            (
                Self::build_numstat_map(
                    try_run_git(
                        repo_path,
                        &[
                            "-c",
                            "core.quotePath=false",
                            "diff",
                            "--cached",
                            "--numstat",
                        ],
                    )?
                    .as_deref(),
                ),
                Self::build_numstat_map(
                    try_run_git(
                        repo_path,
                        &["-c", "core.quotePath=false", "diff", "--numstat"],
                    )?
                    .as_deref(),
                ),
            )
        };

        let mut staged_files: Vec<ChangedFileInfo> = Vec::new();
        let mut unstaged_files: Vec<ChangedFileInfo> = Vec::new();
        let mut untracked_files: Vec<ChangedFileInfo> = Vec::new();
        let mut total_additions = 0u32;
        let mut total_deletions = 0u32;

        if let Some(compare_entries) = compare_name_status {
            let mut seen_in_base_mode: HashSet<String> = HashSet::new();

            for line in status_stdout.lines() {
                if line.len() < 3 {
                    continue;
                }
                let x = line.chars().next().unwrap_or(' ');
                let y = line.chars().nth(1).unwrap_or(' ');
                if x == '?' && y == '?' {
                    let file_path = Self::unquote_path(&line[3..]);
                    let additions = Self::count_file_lines(repo_path, &file_path);
                    total_additions += additions;
                    untracked_files.push(ChangedFileInfo {
                        path: file_path,
                        status: "?".to_string(),
                        additions,
                        deletions: 0,
                        staged: false,
                    });
                }
            }

            for (file_path, status) in compare_entries {
                if !seen_in_base_mode.insert(file_path.clone()) {
                    continue;
                }

                let (additions, deletions) =
                    staged_numstat.get(&file_path).copied().unwrap_or((0, 0));
                total_additions += additions;
                total_deletions += deletions;

                staged_files.push(ChangedFileInfo {
                    path: file_path,
                    status,
                    additions,
                    deletions,
                    staged: true,
                });
            }

            return Ok(ChangedFilesInfo {
                staged_files,
                unstaged_files,
                untracked_files,
                total_additions,
                total_deletions,
                compare_ref,
            });
        }

        for line in status_stdout.lines() {
            if line.len() < 3 {
                continue;
            }
            let x = line.chars().next().unwrap_or(' ');
            let y = line.chars().nth(1).unwrap_or(' ');
            let porcelain_status = format!("{x}{y}");
            let is_unmerged = is_unmerged_porcelain_status(&porcelain_status);
            let file_path = Self::unquote_path(&line[3..]);

            if x == '?' && y == '?' {
                let additions = Self::count_file_lines(repo_path, &file_path);
                total_additions += additions;
                untracked_files.push(ChangedFileInfo {
                    path: file_path,
                    status: "?".to_string(),
                    additions,
                    deletions: 0,
                    staged: false,
                });
            } else {
                if x != ' ' && x != '?' {
                    let (additions, deletions) =
                        staged_numstat.get(&file_path).copied().unwrap_or((0, 0));
                    total_additions += additions;
                    total_deletions += deletions;

                    let status = if is_unmerged {
                        porcelain_status.clone()
                    } else {
                        match x {
                            'M' => "M",
                            'A' => "A",
                            'D' => "D",
                            'R' => "R",
                            'C' => "C",
                            'U' => "U",
                            _ => "M",
                        }
                        .to_string()
                    };

                    staged_files.push(ChangedFileInfo {
                        path: file_path.clone(),
                        status,
                        additions,
                        deletions,
                        staged: true,
                    });
                }

                if y != ' ' {
                    let (additions, deletions) =
                        unstaged_numstat.get(&file_path).copied().unwrap_or((0, 0));
                    total_additions += additions;
                    total_deletions += deletions;

                    let status = if is_unmerged {
                        porcelain_status.clone()
                    } else {
                        match y {
                            'M' => "M",
                            'D' => "D",
                            'U' => "U",
                            _ => "M",
                        }
                        .to_string()
                    };

                    unstaged_files.push(ChangedFileInfo {
                        path: file_path,
                        status,
                        additions,
                        deletions,
                        staged: false,
                    });
                }
            }
        }

        Ok(ChangedFilesInfo {
            staged_files,
            unstaged_files,
            untracked_files,
            total_additions,
            total_deletions,
            compare_ref,
        })
    }

    pub fn get_changed_files_for_commit(
        &self,
        repo_path: &Path,
        commit_ref: &str,
    ) -> Result<ChangedFilesInfo> {
        let commit = self.resolve_explicit_commit_ref(repo_path, commit_ref)?;
        let parent_ref = Self::first_parent_ref(repo_path, &commit)?;
        let numstat = if let Some(parent_ref) = parent_ref.as_deref() {
            Self::build_numstat_map(
                try_run_git(
                    repo_path,
                    &[
                        "-c",
                        "core.quotePath=false",
                        "diff",
                        "--numstat",
                        parent_ref,
                        &commit,
                    ],
                )?
                .as_deref(),
            )
        } else {
            Self::build_numstat_map(
                try_run_git(
                    repo_path,
                    &[
                        "-c",
                        "core.quotePath=false",
                        "diff-tree",
                        "--root",
                        "--no-commit-id",
                        "--numstat",
                        "-r",
                        &commit,
                    ],
                )?
                .as_deref(),
            )
        };
        let entries = if let Some(parent_ref) = parent_ref.as_deref() {
            Self::build_name_status_entries(
                try_run_git(
                    repo_path,
                    &[
                        "-c",
                        "core.quotePath=false",
                        "diff",
                        "--name-status",
                        parent_ref,
                        &commit,
                    ],
                )?
                .as_deref(),
            )
        } else {
            Self::build_name_status_entries(
                try_run_git(
                    repo_path,
                    &[
                        "-c",
                        "core.quotePath=false",
                        "diff-tree",
                        "--root",
                        "--no-commit-id",
                        "--name-status",
                        "-r",
                        &commit,
                    ],
                )?
                .as_deref(),
            )
        };

        let mut staged_files = Vec::new();
        let mut total_additions = 0u32;
        let mut total_deletions = 0u32;
        let mut seen = HashSet::new();

        for (file_path, status) in entries {
            if !seen.insert(file_path.clone()) {
                continue;
            }

            let (additions, deletions) = numstat.get(&file_path).copied().unwrap_or((0, 0));
            total_additions += additions;
            total_deletions += deletions;

            staged_files.push(ChangedFileInfo {
                path: file_path,
                status,
                additions,
                deletions,
                staged: true,
            });
        }

        Ok(ChangedFilesInfo {
            staged_files,
            unstaged_files: Vec::new(),
            untracked_files: Vec::new(),
            total_additions,
            total_deletions,
            compare_ref: Some(commit),
        })
    }

    /// Get file diff content (old vs new)
    ///
    /// When `against_index` is true, `old_content` is read from the Git index (`git show :path`)
    /// so the diff reflects **unstaged** changes only (index vs worktree).
    pub fn get_file_diff(
        &self,
        repo_path: &Path,
        file_path: &str,
        base_branch: Option<&str>,
        against_index: bool,
    ) -> Result<FileDiffInfo> {
        let status_stdout = run_git(
            repo_path,
            &[
                "-c",
                "core.quotePath=false",
                "status",
                "--porcelain",
                "--",
                file_path,
            ],
        )?;

        let status = if let Some(line) = status_stdout.lines().next() {
            let code = &line[0..2];
            match code.trim() {
                "M" | " M" | "MM" => "M",
                "A" | " A" | "AM" => "A",
                "D" | " D" => "D",
                "??" => "A",
                _ => "M",
            }
            .to_string()
        } else {
            "M".to_string()
        };

        let compare_ref = if against_index {
            None
        } else {
            self.resolve_preferred_compare_ref(repo_path, base_branch)?
        };

        let old_content = if against_index {
            if status == "A" {
                String::new()
            } else {
                let spec = format!(":{file_path}");
                try_run_git(repo_path, &["show", &spec])?.unwrap_or_default()
            }
        } else if status == "A" {
            String::new()
        } else {
            let show_ref = compare_ref
                .as_deref()
                .map(|base_ref| format!("{base_ref}:{file_path}"))
                .unwrap_or_else(|| format!("HEAD:{file_path}"));
            try_run_git(repo_path, &["show", &show_ref])?.unwrap_or_default()
        };

        let new_content = if status == "D" {
            String::new()
        } else {
            Self::read_worktree_blob_content(repo_path, file_path)
        };

        Ok(FileDiffInfo {
            file_path: file_path.to_string(),
            old_content,
            new_content,
            status,
            compare_ref,
        })
    }

    pub fn get_file_diff_for_commit(
        &self,
        repo_path: &Path,
        file_path: &str,
        commit_ref: &str,
    ) -> Result<FileDiffInfo> {
        let commit = self.resolve_explicit_commit_ref(repo_path, commit_ref)?;
        let parent_ref = Self::first_parent_ref(repo_path, &commit)?;

        let name_status = if let Some(parent_ref) = parent_ref.as_deref() {
            try_run_git(
                repo_path,
                &[
                    "-c",
                    "core.quotePath=false",
                    "diff",
                    "--name-status",
                    parent_ref,
                    &commit,
                ],
            )?
            .unwrap_or_default()
        } else {
            try_run_git(
                repo_path,
                &[
                    "-c",
                    "core.quotePath=false",
                    "diff-tree",
                    "--root",
                    "--no-commit-id",
                    "--name-status",
                    "-r",
                    &commit,
                ],
            )?
            .unwrap_or_default()
        };

        let mut status = "M".to_string();
        let mut old_path = file_path.to_string();
        let mut new_path = file_path.to_string();

        for line in name_status.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() < 2 {
                continue;
            }

            let status_code = parts[0].chars().next().unwrap_or('M');
            let (candidate_old_path, candidate_new_path) =
                if matches!(status_code, 'R' | 'C') && parts.len() >= 3 {
                    (Self::unquote_path(parts[1]), Self::unquote_path(parts[2]))
                } else {
                    let path = Self::unquote_path(parts[1]);
                    (path.clone(), path)
                };

            if candidate_old_path != file_path && candidate_new_path != file_path {
                continue;
            }

            status = Self::normalize_name_status_code(status_code).to_string();
            old_path = candidate_old_path;
            new_path = candidate_new_path;
            break;
        }

        let old_content = if status == "A" {
            String::new()
        } else if let Some(parent_ref) = parent_ref.as_deref() {
            try_run_git(repo_path, &["show", &format!("{parent_ref}:{old_path}")])?
                .unwrap_or_default()
        } else {
            String::new()
        };

        let new_content = if status == "D" {
            String::new()
        } else {
            try_run_git(repo_path, &["show", &format!("{commit}:{new_path}")])?.unwrap_or_default()
        };

        Ok(FileDiffInfo {
            file_path: file_path.to_string(),
            old_content,
            new_content,
            status,
            compare_ref: Some(commit),
        })
    }

    /// Parse `git diff --numstat` output into a map of file_path -> (additions, deletions).
    fn build_numstat_map(output: Option<&str>) -> HashMap<String, (u32, u32)> {
        let Some(output) = output else {
            return HashMap::new();
        };
        output
            .lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 3 {
                    let additions = parts[0].parse().unwrap_or(0);
                    let deletions = parts[1].parse().unwrap_or(0);
                    Some((
                        Self::normalize_numstat_path(parts[2]),
                        (additions, deletions),
                    ))
                } else {
                    None
                }
            })
            .collect()
    }

    fn normalize_numstat_path(path: &str) -> String {
        let unquoted = Self::unquote_path(path);
        if !unquoted.contains(" => ") {
            return unquoted;
        }

        if let (Some(open), Some(close)) = (unquoted.find('{'), unquoted.rfind('}')) {
            if open < close {
                let inner = &unquoted[open + 1..close];
                if let Some((_, new_name)) = inner.split_once(" => ") {
                    return format!(
                        "{}{}{}",
                        &unquoted[..open],
                        new_name,
                        &unquoted[close + 1..]
                    );
                }
            }
        }

        if let Some((_, new_path)) = unquoted.rsplit_once(" => ") {
            new_path.to_string()
        } else {
            unquoted
        }
    }

    fn build_name_status_entries(output: Option<&str>) -> Vec<(String, String)> {
        let Some(output) = output else {
            return Vec::new();
        };

        output
            .lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() < 2 {
                    return None;
                }

                let status_code = parts[0].chars().next().unwrap_or('M');
                let status = Self::normalize_name_status_code(status_code).to_string();
                let path_index = if matches!(status_code, 'R' | 'C') && parts.len() >= 3 {
                    2
                } else {
                    1
                };

                Some((Self::unquote_path(parts[path_index]), status))
            })
            .collect()
    }

    fn normalize_name_status_code(status_code: char) -> &'static str {
        match status_code {
            'A' => "A",
            'D' => "D",
            'R' => "R",
            'C' => "C",
            'U' => "U",
            _ => "M",
        }
    }

    fn resolve_explicit_commit_ref(&self, repo_path: &Path, commit_ref: &str) -> Result<String> {
        let normalized = commit_ref.trim();
        if normalized.is_empty() {
            return Err(crate::error::EngineError::Git(
                "Commit ref cannot be empty".to_string(),
            ));
        }

        let verified = run_git(
            repo_path,
            &["rev-parse", "--verify", &format!("{normalized}^{{commit}}")],
        )?;
        Ok(verified.trim().to_string())
    }

    fn first_parent_ref(repo_path: &Path, commit: &str) -> Result<Option<String>> {
        Ok(
            try_run_git(repo_path, &["rev-list", "--parents", "-n", "1", commit])?
                .and_then(|stdout| stdout.split_whitespace().nth(1).map(str::to_string)),
        )
    }

    /// Count lines in a file (used for untracked file additions count).
    fn count_file_lines(repo_path: &Path, file_path: &str) -> u32 {
        let full_path = repo_path.join(file_path);
        if full_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&full_path) {
                return content.lines().count() as u32;
            }
        }
        0
    }

    /// Helper to unquote path from git output, handling common escape sequences.
    fn unquote_path(path: &str) -> String {
        if path.starts_with('"') && path.ends_with('"') {
            let inner = &path[1..path.len() - 1];
            let mut result = String::with_capacity(inner.len());
            let mut chars = inner.chars();
            while let Some(c) = chars.next() {
                if c == '\\' {
                    match chars.next() {
                        Some('"') => result.push('"'),
                        Some('\\') => result.push('\\'),
                        Some('n') => result.push('\n'),
                        Some('t') => result.push('\t'),
                        Some(other) => {
                            result.push('\\');
                            result.push(other);
                        }
                        None => result.push('\\'),
                    }
                } else {
                    result.push(c);
                }
            }
            result
        } else {
            path.to_string()
        }
    }

    /// Read the worktree content the same way Git would materialize the blob.
    ///
    /// For regular files we return the file bytes as UTF-8 text. For symlinks, Git stores the
    /// link target path in the blob rather than the target file's content, so we must read the
    /// symlink target itself instead of following the link.
    fn read_worktree_blob_content(repo_path: &Path, file_path: &str) -> String {
        let full_path = repo_path.join(file_path);
        let Ok(metadata) = std::fs::symlink_metadata(&full_path) else {
            return String::new();
        };

        if metadata.file_type().is_symlink() {
            return std::fs::read_link(&full_path)
                .map(|target| target.to_string_lossy().into_owned())
                .unwrap_or_default();
        }

        std::fs::read_to_string(&full_path).unwrap_or_default()
    }
}
