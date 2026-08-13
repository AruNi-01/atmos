use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use jwalk::WalkDir;

use crate::error::{EngineError, Result};

use super::{
    fetch_remote_branch, remote_branch_fetch_target, run_git, try_run_git,
    types::parse_worktree_list, GitEngine, WorktreeInfo,
};

/// Directories that are almost never git repo roots and are expensive to walk.
const DISCOVER_SKIP_DIR_NAMES: &[&str] = &[
    "node_modules",
    "target",
    ".next",
    "dist",
    "build",
    "__pycache__",
    ".venv",
    "venv",
    ".tox",
    ".m2",
    ".gradle",
    ".npm",
    ".pnpm-store",
    ".cache",
    ".Trash",
    "DerivedData",
    "Pods",
    ".turbo",
    "coverage",
    ".yarn",
    "CMakeFiles",
    "zig-cache",
    ".direnv",
    ".devenv",
    "Library",
    ".atmos",
    ".claude",
    ".cursor",
    ".codex",
    ".copilot",
    ".gemini",
    ".continue",
    ".windsurf",
    ".codeium",
    ".aider",
    ".kimi-code",
    ".local",
];

impl GitEngine {
    /// Get the atmos workspace base directory: ~/.atmos/workspaces
    pub fn get_workspaces_base_dir(&self) -> Result<PathBuf> {
        let home = dirs::home_dir()
            .ok_or_else(|| EngineError::Git("Unable to determine home directory".to_string()))?;
        Ok(home.join(".atmos").join("data").join("workspaces"))
    }

    /// Get the worktree path for a workspace: ~/.atmos/workspaces/{project_scope}/{workspace_name}
    /// Note: workspace_name may already include the project scope prefix.
    pub fn get_worktree_path(&self, workspace_name: &str) -> Result<PathBuf> {
        let base = self.get_workspaces_base_dir()?;
        Ok(base.join(workspace_name))
    }

    /// Create a git worktree for a new workspace
    ///
    /// # Arguments
    /// * `repo_path` - Path to the main git repository
    /// * `workspace_name` - Name of the workspace (e.g., "aruni/pikachu", used as branch name and path)
    /// * `base_branch` - The branch to base the new worktree on (e.g., "main")
    ///
    /// # Returns
    /// The path to the created worktree
    pub fn create_worktree(
        &self,
        repo_path: &Path,
        workspace_name: &str,
        branch_name: &str,
        base_branch: &str,
    ) -> Result<PathBuf> {
        let worktree_path = self.get_worktree_path(workspace_name)?;

        // Ensure parent directory exists
        if let Some(parent) = worktree_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                EngineError::Git(format!("Failed to create worktree directory: {}", e))
            })?;
        }

        if worktree_path.exists() {
            return Err(EngineError::Git(format!(
                "Worktree already exists at: {}",
                worktree_path.display()
            )));
        }

        // Fetch only the requested base branch. A plain `git fetch origin` can
        // pull every remote branch in shallow CI checkouts and stall workspace
        // creation, even though this refresh is non-fatal.
        if let Err(e) = fetch_remote_branch(repo_path, base_branch) {
            tracing::warn!("Git fetch warning for {}: {}", base_branch, e);
        }

        let base_ref = self.resolve_remote_branch_ref(repo_path, base_branch)?;

        let worktree_str = worktree_path
            .to_str()
            .ok_or_else(|| EngineError::Git("Non-UTF-8 worktree path".into()))?;

        run_git(
            repo_path,
            &[
                "worktree",
                "add",
                "-b",
                branch_name,
                worktree_str,
                &base_ref,
            ],
        )
        .map_err(|e| {
            EngineError::Git(format!(
                "Failed to create worktree (likely branch conflict): {}",
                e
            ))
        })?;

        tracing::info!(
            "Created worktree at {} with branch {} (not pushed to remote yet)",
            worktree_path.display(),
            branch_name
        );

        Ok(worktree_path)
    }

    /// Create a worktree that tracks an existing remote branch (e.g., a PR head branch).
    ///
    /// If the local branch already exists, checks it out as-is. Otherwise creates a
    /// local branch tracking `origin/<remote_branch>`.
    pub fn create_worktree_from_remote_branch(
        &self,
        repo_path: &Path,
        workspace_name: &str,
        remote_branch: &str,
    ) -> Result<PathBuf> {
        let worktree_path = self.get_worktree_path(workspace_name)?;

        if let Some(parent) = worktree_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                EngineError::Git(format!("Failed to create worktree directory: {}", e))
            })?;
        }

        if worktree_path.exists() {
            return Err(EngineError::Git(format!(
                "Worktree already exists at: {}",
                worktree_path.display()
            )));
        }

        let remote_target = remote_branch_fetch_target(repo_path, remote_branch)?
            .ok_or_else(|| EngineError::Git("Remote branch name cannot be empty".to_string()))?;
        if let Err(e) = fetch_remote_branch(repo_path, remote_branch) {
            tracing::warn!("Git fetch warning for {}: {}", remote_branch, e);
        }

        let worktree_str = worktree_path
            .to_str()
            .ok_or_else(|| EngineError::Git("Non-UTF-8 worktree path".into()))?;

        let local_branch = remote_target.local_branch_name();
        let local_branches = self.list_branches(repo_path).unwrap_or_default();
        let result = if local_branches.iter().any(|b| b == &local_branch) {
            run_git(repo_path, &["worktree", "add", worktree_str, &local_branch])
        } else {
            let remote_ref = format!("{}/{}", remote_target.remote, remote_target.branch);
            run_git(
                repo_path,
                &[
                    "worktree",
                    "add",
                    "--track",
                    "-b",
                    &local_branch,
                    worktree_str,
                    &remote_ref,
                ],
            )
        };

        result.map_err(|e| {
            EngineError::Git(format!(
                "Failed to create worktree from remote branch `{}`: {}",
                remote_branch, e
            ))
        })?;

        tracing::info!(
            "Created worktree at {} tracking branch {}",
            worktree_path.display(),
            remote_target.branch
        );

        Ok(worktree_path)
    }

    /// Remove a git worktree
    ///
    /// # Arguments
    /// * `repo_path` - Path to the main git repository
    /// * `workspace_name` - Name of the workspace to remove (e.g., "aruni/pikachu")
    pub fn remove_worktree(
        &self,
        repo_path: &Path,
        workspace_name: &str,
        branch_name: &str,
        delete_remote_branch: bool,
    ) -> Result<()> {
        let worktree_path = self.get_worktree_path(workspace_name)?;

        if !worktree_path.exists() {
            tracing::warn!("Worktree does not exist: {}", worktree_path.display());
            return Ok(());
        }

        let worktree_str = worktree_path
            .to_str()
            .ok_or_else(|| EngineError::Git("Non-UTF-8 worktree path".into()))?;

        run_git(repo_path, &["worktree", "remove", "--force", worktree_str])?;

        // Delete local branch (non-fatal)
        if try_run_git(repo_path, &["branch", "-D", branch_name])?.is_some() {
            tracing::info!("Deleted local branch: {}", branch_name);
        }

        // Delete remote branch if configured (non-fatal)
        if delete_remote_branch
            && try_run_git(repo_path, &["push", "origin", "--delete", branch_name])?.is_some()
        {
            tracing::info!("Deleted remote branch: origin/{}", branch_name);
        }

        tracing::info!("Removed worktree for workspace {}", workspace_name);

        Ok(())
    }

    /// List all worktrees for a repository
    pub fn list_worktrees(&self, repo_path: &Path) -> Result<Vec<WorktreeInfo>> {
        let stdout = run_git(repo_path, &["worktree", "list", "--porcelain"])?;
        Ok(parse_worktree_list(&stdout))
    }

    /// Find linked git worktrees under `search_root` (typically the user home).
    ///
    /// Walks for `.git` dirs/files while skipping heavy trees, then runs
    /// `git worktree list` once per unique repository. Returns only **linked**
    /// worktrees (`.git` is a file), not the main checkout.
    ///
    /// Also seeds known agent worktree dirs (`~/.cursor/worktrees`, …) even
    /// though those parent trees are skipped during the home walk.
    pub fn discover_linked_worktrees(
        &self,
        search_root: &Path,
        cancel: Option<&AtomicBool>,
    ) -> Vec<PathBuf> {
        let mut roots = vec![search_root.to_path_buf()];
        roots.extend(extra_worktree_search_roots(search_root));
        linked_worktrees_from_roots(&roots, cancel)
    }

    /// Cheap pass: only known agent worktree directories, no home-wide `.git` walk.
    pub fn discover_linked_worktrees_fast(
        &self,
        home: &Path,
        cancel: Option<&AtomicBool>,
    ) -> Vec<PathBuf> {
        linked_worktrees_from_roots(&extra_worktree_search_roots(home), cancel)
    }
}

fn linked_worktrees_from_roots(roots: &[PathBuf], cancel: Option<&AtomicBool>) -> Vec<PathBuf> {
    let mut seeds = Vec::new();
    for root in roots {
        if cancel.is_some_and(|c| c.load(Ordering::Relaxed)) {
            break;
        }
        if root.is_dir() {
            collect_git_seeds(root, cancel, &mut seeds);
        }
    }

    let mut seen_common = HashSet::new();
    let mut linked = Vec::new();
    let mut seen_path = HashSet::new();
    for seed in seeds {
        if cancel.is_some_and(|c| c.load(Ordering::Relaxed)) {
            break;
        }
        let Some(common) = git_common_dir(&seed) else {
            continue;
        };
        if !seen_common.insert(common) {
            continue;
        }
        let Ok(Some(stdout)) = try_run_git(&seed, &["worktree", "list", "--porcelain"]) else {
            continue;
        };
        for info in parse_worktree_list(&stdout) {
            if !is_linked_worktree(&info.path) {
                continue;
            }
            let canon = std::fs::canonicalize(&info.path).unwrap_or(info.path);
            if seen_path.insert(canon.clone()) {
                linked.push(canon);
            }
        }
    }
    linked.sort();
    linked
}

fn extra_worktree_search_roots(home: &Path) -> Vec<PathBuf> {
    let mut roots = vec![
        home.join(".cursor").join("worktrees"),
        home.join(".codex").join("worktrees"),
    ];
    if let Ok(codex_home) = std::env::var("CODEX_HOME") {
        let p = PathBuf::from(codex_home.trim());
        if !p.as_os_str().is_empty() {
            roots.push(p.join("worktrees"));
        }
    }
    roots
}

fn should_skip_discover_dir(name: &str) -> bool {
    DISCOVER_SKIP_DIR_NAMES
        .iter()
        .any(|skip| name.eq_ignore_ascii_case(skip))
}

fn collect_git_seeds(root: &Path, cancel: Option<&AtomicBool>, out: &mut Vec<PathBuf>) {
    if !root.is_dir() {
        return;
    }
    let walker = WalkDir::new(root)
        .follow_links(false)
        .skip_hidden(false)
        .max_depth(16)
        .process_read_dir(|depth, path, _state, children| {
            // jwalk's first callback uses depth=None and `path` = parent of the
            // walk root. Skipping that would drop `~/.cursor/worktrees` itself.
            if depth.is_none() {
                return;
            }
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name == ".git" || should_skip_discover_dir(name) {
                children.retain(|_| false);
            }
        });
    for entry in walker {
        if cancel.is_some_and(|c| c.load(Ordering::Relaxed)) {
            break;
        }
        let Ok(entry) = entry else {
            continue;
        };
        if entry.file_name() != ".git" {
            continue;
        }
        out.push(entry.parent_path().to_path_buf());
    }
}

fn git_common_dir(seed: &Path) -> Option<PathBuf> {
    let raw = try_run_git(seed, &["rev-parse", "--git-common-dir"]).ok()??;
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    let p = PathBuf::from(raw);
    let abs = if p.is_absolute() { p } else { seed.join(p) };
    Some(std::fs::canonicalize(&abs).unwrap_or(abs))
}

fn is_linked_worktree(path: &Path) -> bool {
    path.join(".git").is_file()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("atmos-git-discover-{name}-{suffix}"));
        fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    fn git(dir: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(dir)
            .args(args)
            .output()
            .expect("git");
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn discover_linked_worktrees_finds_extra_checkout_not_main() {
        let root = unique_temp_dir("linked");
        let repo = root.join("repo");
        let linked = root.join("linked-wt");
        fs::create_dir_all(&repo).unwrap();
        git(&repo, &["init"]);
        git(&repo, &["config", "user.email", "test@example.com"]);
        git(&repo, &["config", "user.name", "Test"]);
        fs::write(repo.join("README.md"), "hi").unwrap();
        git(&repo, &["add", "README.md"]);
        git(&repo, &["commit", "-m", "init"]);
        git(
            &repo,
            &[
                "worktree",
                "add",
                "-b",
                "feature",
                linked.to_str().expect("utf8"),
            ],
        );

        // Fake nested .git under node_modules must not become a seed we walk into.
        let fake = repo.join("node_modules").join("pkg").join(".git");
        fs::create_dir_all(&fake).unwrap();

        let linked_canon = std::fs::canonicalize(&linked).unwrap_or_else(|_| linked.clone());
        let repo_canon = std::fs::canonicalize(&repo).unwrap_or_else(|_| repo.clone());
        let found = GitEngine::new().discover_linked_worktrees(&root, None);
        let _ = fs::remove_dir_all(&root);
        assert!(
            found.iter().any(|p| p == &linked_canon),
            "expected linked worktree in {found:?}"
        );
        assert!(
            found.iter().all(|p| p != &repo_canon),
            "main checkout must not be listed as linked: {found:?}"
        );
    }

    #[test]
    fn discover_linked_worktrees_fast_skips_home_and_hits_agent_dirs() {
        let root = unique_temp_dir("fast");
        let leftover_repo = root.join("leftover-repo");
        let leftover = root.join("leftover-wt");
        let cursor_repo = root.join("cursor-repo");
        let cursor_wt = root.join(".cursor").join("worktrees").join("feat");

        fn init_repo_with_commit(repo: &Path) {
            fs::create_dir_all(repo).unwrap();
            git(repo, &["init"]);
            git(repo, &["config", "user.email", "test@example.com"]);
            git(repo, &["config", "user.name", "Test"]);
            fs::write(repo.join("README.md"), "hi").unwrap();
            git(repo, &["add", "README.md"]);
            git(repo, &["commit", "-m", "init"]);
        }

        init_repo_with_commit(&leftover_repo);
        git(
            &leftover_repo,
            &[
                "worktree",
                "add",
                "-b",
                "left",
                leftover.to_str().expect("utf8"),
            ],
        );
        init_repo_with_commit(&cursor_repo);
        git(
            &cursor_repo,
            &[
                "worktree",
                "add",
                "-b",
                "cursor",
                cursor_wt.to_str().expect("utf8"),
            ],
        );

        let leftover_canon = std::fs::canonicalize(&leftover).unwrap_or_else(|_| leftover.clone());
        let cursor_canon = std::fs::canonicalize(&cursor_wt).unwrap_or_else(|_| cursor_wt.clone());
        let engine = GitEngine::new();
        let fast = engine.discover_linked_worktrees_fast(&root, None);
        let full = engine.discover_linked_worktrees(&root, None);
        let _ = fs::remove_dir_all(&root);

        assert!(
            fast.iter().any(|p| p == &cursor_canon),
            "fast pass should find agent worktrees: {fast:?}"
        );
        assert!(
            fast.iter().all(|p| p != &leftover_canon),
            "fast pass must not walk the rest of home: {fast:?}"
        );
        assert!(
            full.iter().any(|p| p == &leftover_canon),
            "full pass should find leftover worktrees: {full:?}"
        );
    }
}
