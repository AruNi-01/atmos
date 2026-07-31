use std::collections::{HashMap, HashSet};
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::error::Result;

use super::{
    run_git, try_run_git, try_run_git_bytes, ChangedFileInfo, ChangedFilesInfo, DiffContentKind,
    DiffPreviewKind, FileDiffInfo, GitBlobLocator, GitEngine,
};

/// Max UTF-8 text side size shipped over the git-diff WS channel.
const TEXT_DIFF_MAX_BYTES: u64 = (1536 * 1024) as u64; // 1.5 MiB

struct NameStatusEntry {
    status: String,
    old_path: String,
    new_path: String,
}

#[derive(Debug, Clone, Copy)]
struct NumstatCounts {
    additions: u32,
    deletions: u32,
    is_binary: bool,
}

struct SideBytes {
    bytes: Vec<u8>,
    /// Symlink target stored as text blob; never classified as binary.
    is_symlink_target: bool,
}

struct ClassifiedSide {
    is_binary: bool,
    size: u64,
    sha256: String,
    /// Set only for UTF-8 text under the WS size cap.
    text: Option<String>,
    too_large: bool,
}

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
                    &[
                        "-c",
                        "core.quotePath=false",
                        "diff",
                        "--find-renames",
                        "--numstat",
                        base_ref,
                    ],
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
                        "--find-renames",
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
                    let (additions, is_binary) = Self::count_untracked_stats(repo_path, &file_path);
                    if !is_binary {
                        total_additions += additions;
                    }
                    untracked_files.push(ChangedFileInfo {
                        path: file_path,
                        status: "?".to_string(),
                        additions,
                        deletions: 0,
                        is_binary,
                        staged: false,
                    });
                }
            }

            for (file_path, status) in compare_entries {
                if !seen_in_base_mode.insert(file_path.clone()) {
                    continue;
                }

                let counts = staged_numstat
                    .get(&file_path)
                    .copied()
                    .unwrap_or(NumstatCounts {
                        additions: 0,
                        deletions: 0,
                        is_binary: false,
                    });
                if !counts.is_binary {
                    total_additions += counts.additions;
                    total_deletions += counts.deletions;
                }

                staged_files.push(ChangedFileInfo {
                    path: file_path,
                    status,
                    additions: counts.additions,
                    deletions: counts.deletions,
                    is_binary: counts.is_binary,
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
                let (additions, is_binary) = Self::count_untracked_stats(repo_path, &file_path);
                if !is_binary {
                    total_additions += additions;
                }
                untracked_files.push(ChangedFileInfo {
                    path: file_path,
                    status: "?".to_string(),
                    additions,
                    deletions: 0,
                    is_binary,
                    staged: false,
                });
            } else {
                if x != ' ' && x != '?' {
                    let counts = staged_numstat
                        .get(&file_path)
                        .copied()
                        .unwrap_or(NumstatCounts {
                            additions: 0,
                            deletions: 0,
                            is_binary: false,
                        });
                    if !counts.is_binary {
                        total_additions += counts.additions;
                        total_deletions += counts.deletions;
                    }

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
                        additions: counts.additions,
                        deletions: counts.deletions,
                        is_binary: counts.is_binary,
                        staged: true,
                    });
                }

                if y != ' ' {
                    let counts =
                        unstaged_numstat
                            .get(&file_path)
                            .copied()
                            .unwrap_or(NumstatCounts {
                                additions: 0,
                                deletions: 0,
                                is_binary: false,
                            });
                    if !counts.is_binary {
                        total_additions += counts.additions;
                        total_deletions += counts.deletions;
                    }

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
                        additions: counts.additions,
                        deletions: counts.deletions,
                        is_binary: counts.is_binary,
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
                        "--find-renames",
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
                        "--find-renames",
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
                        "--find-renames",
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
                        "--find-renames",
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

            let counts = numstat.get(&file_path).copied().unwrap_or(NumstatCounts {
                additions: 0,
                deletions: 0,
                is_binary: false,
            });
            if !counts.is_binary {
                total_additions += counts.additions;
                total_deletions += counts.deletions;
            }

            staged_files.push(ChangedFileInfo {
                path: file_path,
                status,
                additions: counts.additions,
                deletions: counts.deletions,
                is_binary: counts.is_binary,
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

    /// Get file diff content (old vs new).
    ///
    /// When `against_index` is true, the old side is the Git index (`git show :path`)
    /// so the diff reflects **unstaged** changes only (index vs worktree).
    ///
    /// Binary / oversized sides never return text content — only sizes, hashes, and
    /// blob locators for HTTP preview.
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

        let worktree_status = if let Some(line) = status_stdout.lines().next() {
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
        let compare_entry = if let Some(base_ref) = compare_ref.as_deref() {
            Self::find_name_status_entry(
                try_run_git(
                    repo_path,
                    &[
                        "-c",
                        "core.quotePath=false",
                        "diff",
                        "--find-renames",
                        "--name-status",
                        base_ref,
                    ],
                )?
                .as_deref(),
                file_path,
            )
        } else {
            None
        };
        let (status, old_path, new_path) = if let Some(entry) = compare_entry {
            (entry.status, entry.old_path, entry.new_path)
        } else {
            (
                worktree_status,
                file_path.to_string(),
                file_path.to_string(),
            )
        };

        let (old_side, old_blob) = if status == "A" {
            (None, None)
        } else if against_index {
            // Index blob: `git show :path`
            let spec = format!(":{old_path}");
            let side = Self::load_git_side(repo_path, &spec);
            let blob = side.as_ref().map(|_| GitBlobLocator::Git {
                rev: format!(":{old_path}"),
                path: old_path.clone(),
            });
            (side, blob)
        } else {
            let rev = compare_ref
                .as_deref()
                .map(|base_ref| base_ref.to_string())
                .unwrap_or_else(|| "HEAD".to_string());
            let spec = format!("{rev}:{old_path}");
            let side = Self::load_git_side(repo_path, &spec);
            let blob = side.as_ref().map(|_| GitBlobLocator::Git {
                rev,
                path: old_path.clone(),
            });
            (side, blob)
        };

        let (new_side, new_blob) = if status == "D" {
            (None, None)
        } else {
            // Working-tree diffs always use the worktree as the new side.
            let side = Self::load_worktree_side(repo_path, &new_path);
            let blob = side.as_ref().map(|_| GitBlobLocator::Worktree {
                path: new_path.clone(),
            });
            (side, blob)
        };

        Ok(Self::build_file_diff_info(
            file_path,
            &status,
            compare_ref,
            old_side,
            new_side,
            old_blob,
            new_blob,
        ))
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
                    "--find-renames",
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
                    "--find-renames",
                    "--root",
                    "--no-commit-id",
                    "--name-status",
                    "-r",
                    &commit,
                ],
            )?
            .unwrap_or_default()
        };

        let entry =
            Self::find_name_status_entry(Some(&name_status), file_path).unwrap_or_else(|| {
                NameStatusEntry {
                    status: "M".to_string(),
                    old_path: file_path.to_string(),
                    new_path: file_path.to_string(),
                }
            });

        let (old_side, old_blob) = if entry.status == "A" {
            (None, None)
        } else if let Some(parent_ref) = parent_ref.as_deref() {
            let spec = format!("{parent_ref}:{}", entry.old_path);
            let side = Self::load_git_side(repo_path, &spec);
            let blob = side.as_ref().map(|_| GitBlobLocator::Git {
                rev: parent_ref.to_string(),
                path: entry.old_path.clone(),
            });
            (side, blob)
        } else {
            (None, None)
        };

        let (new_side, new_blob) = if entry.status == "D" {
            (None, None)
        } else {
            let spec = format!("{commit}:{}", entry.new_path);
            let side = Self::load_git_side(repo_path, &spec);
            let blob = side.as_ref().map(|_| GitBlobLocator::Git {
                rev: commit.clone(),
                path: entry.new_path.clone(),
            });
            (side, blob)
        };

        Ok(Self::build_file_diff_info(
            file_path,
            &entry.status,
            Some(commit),
            old_side,
            new_side,
            old_blob,
            new_blob,
        ))
    }

    /// Parse `git diff --numstat` output into path → counts (binary when columns are `-`).
    fn build_numstat_map(output: Option<&str>) -> HashMap<String, NumstatCounts> {
        let Some(output) = output else {
            return HashMap::new();
        };
        let mut files = HashMap::new();
        for line in output.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() < 3 {
                continue;
            }

            let is_binary = parts[0] == "-" || parts[1] == "-";
            let additions = if is_binary {
                0
            } else {
                parts[0].parse().unwrap_or(0)
            };
            let deletions = if is_binary {
                0
            } else {
                parts[1].parse().unwrap_or(0)
            };
            let counts = NumstatCounts {
                additions,
                deletions,
                is_binary,
            };
            let raw_path = Self::unquote_path(parts[2]);
            if let Some(normalized_path) = Self::normalize_numstat_rename_path(&raw_path) {
                files.entry(normalized_path).or_insert(counts);
            }
            files.insert(raw_path, counts);
        }

        files
    }

    fn normalize_numstat_rename_path(path: &str) -> Option<String> {
        if !path.contains(" => ") {
            return None;
        }

        if let (Some(open), Some(close)) = (path.find('{'), path.rfind('}')) {
            if open < close {
                let inner = &path[open + 1..close];
                if let Some((_, new_name)) = inner.split_once(" => ") {
                    return Some(format!(
                        "{}{}{}",
                        &path[..open],
                        new_name,
                        &path[close + 1..]
                    ));
                }
            }
        }

        if let Some((_, new_path)) = path.rsplit_once(" => ") {
            Some(new_path.to_string())
        } else {
            None
        }
    }

    fn build_name_status_entries(output: Option<&str>) -> Vec<(String, String)> {
        Self::parse_name_status_entries(output)
            .into_iter()
            .map(|entry| (entry.new_path, entry.status))
            .collect()
    }

    fn find_name_status_entry(output: Option<&str>, file_path: &str) -> Option<NameStatusEntry> {
        Self::parse_name_status_entries(output)
            .into_iter()
            .find(|entry| entry.old_path == file_path || entry.new_path == file_path)
    }

    fn parse_name_status_entries(output: Option<&str>) -> Vec<NameStatusEntry> {
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
                let (old_path, new_path) = if matches!(status_code, 'R' | 'C') && parts.len() >= 3 {
                    (Self::unquote_path(parts[1]), Self::unquote_path(parts[2]))
                } else {
                    let path = Self::unquote_path(parts[1]);
                    (path.clone(), path)
                };

                Some(NameStatusEntry {
                    status,
                    old_path,
                    new_path,
                })
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

    /// Untracked file stats: line count for text, or binary with 0 lines.
    fn count_untracked_stats(repo_path: &Path, file_path: &str) -> (u32, bool) {
        let full_path = repo_path.join(file_path);
        let Ok(bytes) = std::fs::read(&full_path) else {
            return (0, false);
        };
        if Self::bytes_look_binary(&bytes) {
            return (0, true);
        }
        match std::str::from_utf8(&bytes) {
            Ok(text) => (text.lines().count() as u32, false),
            Err(_) => (0, true),
        }
    }

    fn load_git_side(repo_path: &Path, rev_path_spec: &str) -> Option<SideBytes> {
        try_run_git_bytes(repo_path, &["show", rev_path_spec])
            .ok()
            .flatten()
            .map(|bytes| SideBytes {
                bytes,
                is_symlink_target: false,
            })
    }

    fn load_worktree_side(repo_path: &Path, file_path: &str) -> Option<SideBytes> {
        let full_path = repo_path.join(file_path);
        let metadata = std::fs::symlink_metadata(&full_path).ok()?;
        if metadata.file_type().is_symlink() {
            let target = std::fs::read_link(&full_path)
                .map(|t| t.to_string_lossy().into_owned())
                .unwrap_or_default();
            return Some(SideBytes {
                bytes: target.into_bytes(),
                is_symlink_target: true,
            });
        }
        std::fs::read(&full_path).ok().map(|bytes| SideBytes {
            bytes,
            is_symlink_target: false,
        })
    }

    fn classify_side(side: &SideBytes) -> ClassifiedSide {
        let size = side.bytes.len() as u64;
        let sha256 = {
            let mut hasher = Sha256::new();
            hasher.update(&side.bytes);
            hex::encode(hasher.finalize())
        };

        if side.is_symlink_target {
            let text = String::from_utf8_lossy(&side.bytes).into_owned();
            return ClassifiedSide {
                is_binary: false,
                size,
                sha256,
                text: Some(text),
                too_large: false,
            };
        }

        if Self::bytes_look_binary(&side.bytes) {
            return ClassifiedSide {
                is_binary: true,
                size,
                sha256,
                text: None,
                too_large: false,
            };
        }

        match std::str::from_utf8(&side.bytes) {
            Ok(_) if size > TEXT_DIFF_MAX_BYTES => ClassifiedSide {
                is_binary: false,
                size,
                sha256,
                text: None,
                too_large: true,
            },
            Ok(text) => ClassifiedSide {
                is_binary: false,
                size,
                sha256,
                text: Some(text.to_string()),
                too_large: false,
            },
            Err(_) => ClassifiedSide {
                is_binary: true,
                size,
                sha256,
                text: None,
                too_large: false,
            },
        }
    }

    /// Git-style binary heuristic: NUL in the first 8 KiB, or invalid UTF-8.
    fn bytes_look_binary(bytes: &[u8]) -> bool {
        let probe = &bytes[..bytes.len().min(8192)];
        if probe.contains(&0) {
            return true;
        }
        std::str::from_utf8(bytes).is_err()
    }

    fn preview_kind_for_path(path: &str, kind: DiffContentKind) -> DiffPreviewKind {
        if kind == DiffContentKind::Text {
            return DiffPreviewKind::None;
        }
        let ext = Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        match ext.as_str() {
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" | "tiff" | "tif" => {
                DiffPreviewKind::Image
            }
            "mp4" | "webm" | "ogg" | "mov" | "mp3" | "wav" => DiffPreviewKind::Media,
            _ => DiffPreviewKind::None,
        }
    }

    fn build_file_diff_info(
        file_path: &str,
        status: &str,
        compare_ref: Option<String>,
        old_side: Option<SideBytes>,
        new_side: Option<SideBytes>,
        old_blob: Option<GitBlobLocator>,
        new_blob: Option<GitBlobLocator>,
    ) -> FileDiffInfo {
        let old_classified = old_side.as_ref().map(Self::classify_side);
        let new_classified = new_side.as_ref().map(Self::classify_side);

        let any_binary = old_classified.as_ref().is_some_and(|s| s.is_binary)
            || new_classified.as_ref().is_some_and(|s| s.is_binary);
        let any_too_large = old_classified.as_ref().is_some_and(|s| s.too_large)
            || new_classified.as_ref().is_some_and(|s| s.too_large);

        let kind = if any_binary {
            DiffContentKind::Binary
        } else if any_too_large {
            DiffContentKind::TooLarge
        } else {
            DiffContentKind::Text
        };
        let preview_kind = Self::preview_kind_for_path(file_path, kind);

        let (old_text, new_text) = if kind == DiffContentKind::Text {
            (
                old_classified
                    .as_ref()
                    .and_then(|s| s.text.clone())
                    .or_else(|| old_side.as_ref().map(|_| String::new())),
                new_classified
                    .as_ref()
                    .and_then(|s| s.text.clone())
                    .or_else(|| new_side.as_ref().map(|_| String::new())),
            )
        } else {
            (None, None)
        };

        // For pure text with a missing side (add/delete), still provide empty string.
        let (old_text, new_text) = if kind == DiffContentKind::Text {
            let old_text = if old_side.is_none() {
                Some(String::new())
            } else {
                old_text
            };
            let new_text = if new_side.is_none() {
                Some(String::new())
            } else {
                new_text
            };
            (old_text, new_text)
        } else {
            (old_text, new_text)
        };

        FileDiffInfo {
            file_path: file_path.to_string(),
            status: status.to_string(),
            compare_ref,
            kind,
            preview_kind,
            old_text,
            new_text,
            old_size: old_classified.as_ref().map(|s| s.size),
            new_size: new_classified.as_ref().map(|s| s.size),
            old_sha256: old_classified.as_ref().map(|s| s.sha256.clone()),
            new_sha256: new_classified.as_ref().map(|s| s.sha256.clone()),
            old_blob: if kind == DiffContentKind::Text {
                None
            } else {
                old_blob
            },
            new_blob: if kind == DiffContentKind::Text {
                None
            } else {
                new_blob
            },
        }
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
}
