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

        let is_compare_mode = compare_ref.is_some();
        let mut staged_files: Vec<ChangedFileInfo> = Vec::new();
        let mut unstaged_files: Vec<ChangedFileInfo> = Vec::new();
        let mut untracked_files: Vec<ChangedFileInfo> = Vec::new();
        let mut total_additions = 0u32;
        let mut total_deletions = 0u32;
        let mut seen_in_base_mode: HashSet<String> = HashSet::new();

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
            } else if is_compare_mode {
                if seen_in_base_mode.insert(file_path.clone()) {
                    let (additions, deletions) =
                        staged_numstat.get(&file_path).copied().unwrap_or((0, 0));
                    total_additions += additions;
                    total_deletions += deletions;

                    let status_char = if x != ' ' && x != '?' { x } else { y };
                    let status = match status_char {
                        'M' => "M",
                        'A' => "A",
                        'D' => "D",
                        'R' => "R",
                        'C' => "C",
                        'U' => "U",
                        _ => "M",
                    }
                    .to_string();

                    staged_files.push(ChangedFileInfo {
                        path: file_path,
                        status,
                        additions,
                        deletions,
                        staged: true,
                    });
                }
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
                    Some((parts[2].to_string(), (additions, deletions)))
                } else {
                    None
                }
            })
            .collect()
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
