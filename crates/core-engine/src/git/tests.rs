use super::{sync_worktree_local_excludes, GitEngine};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn unique_temp_dir(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after epoch")
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("atmos-git-engine-{name}-{suffix}"));
    fs::create_dir_all(&dir).expect("temp dir should be created");
    dir
}

fn git(current_dir: &Path, args: &[&str]) {
    let output = Command::new("git")
        .current_dir(current_dir)
        .args(args)
        .output()
        .expect("git command should run");
    assert!(
        output.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
}

fn git_output(current_dir: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .current_dir(current_dir)
        .args(args)
        .output()
        .expect("git command should run");
    assert!(
        output.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).expect("git stdout should be utf-8")
}

fn git_succeeds(current_dir: &Path, args: &[&str]) -> bool {
    Command::new("git")
        .current_dir(current_dir)
        .args(args)
        .output()
        .expect("git command should run")
        .status
        .success()
}

fn write_file(path: &Path, content: &str) {
    fs::write(path, content).expect("file should be written");
}

fn commit_file(repo_path: &Path, file_name: &str, content: &str, message: &str) {
    write_file(&repo_path.join(file_name), content);
    git(repo_path, &["add", file_name]);
    git(repo_path, &["commit", "-m", message]);
}

fn configure_repo(repo_path: &Path) {
    git(repo_path, &["config", "user.name", "Atmos Test"]);
    git(repo_path, &["config", "user.email", "atmos@example.com"]);
}

fn setup_remote_repo(name: &str) -> (PathBuf, PathBuf) {
    let root = unique_temp_dir(name);
    let origin_path = root.join("origin.git");
    let seed_path = root.join("seed");

    git(
        &root,
        &["init", "--bare", origin_path.to_str().expect("valid path")],
    );

    fs::create_dir_all(&seed_path).expect("seed dir should be created");
    git(&seed_path, &["init"]);
    configure_repo(&seed_path);
    git(&seed_path, &["branch", "-m", "main"]);
    commit_file(&seed_path, "README.md", "hello\n", "initial");
    git(
        &seed_path,
        &[
            "remote",
            "add",
            "origin",
            origin_path.to_str().expect("valid path"),
        ],
    );
    git(&seed_path, &["push", "-u", "origin", "main"]);
    git(&origin_path, &["symbolic-ref", "HEAD", "refs/heads/main"]);

    (root, origin_path)
}

fn clone_repo(root: &Path, origin_path: &Path, name: &str) -> PathBuf {
    let clone_path = root.join(name);
    git(
        root,
        &[
            "clone",
            origin_path.to_str().expect("valid path"),
            clone_path.to_str().expect("valid path"),
        ],
    );
    configure_repo(&clone_path);
    clone_path
}

fn file_url(path: &Path) -> String {
    reqwest::Url::from_file_path(path)
        .expect("path should convert to file URL")
        .to_string()
}

#[test]
fn git_fetch_targets_current_refs_for_shallow_repositories() {
    let (root, origin_path) = setup_remote_repo("targeted-shallow-fetch");
    let seed_path = root.join("seed");
    git(&seed_path, &["checkout", "-b", "extra"]);
    commit_file(&seed_path, "extra.txt", "extra\n", "extra branch");
    git(&seed_path, &["push", "origin", "extra"]);
    git(&seed_path, &["checkout", "main"]);

    let repo_path = root.join("shallow-work");
    let origin_url = file_url(&origin_path);
    git(
        &root,
        &[
            "clone",
            "--depth=1",
            "--branch",
            "main",
            &origin_url,
            repo_path.to_str().expect("valid path"),
        ],
    );
    configure_repo(&repo_path);
    git(
        &repo_path,
        &[
            "config",
            "--replace-all",
            "remote.origin.fetch",
            "+refs/heads/*:refs/remotes/origin/*",
        ],
    );

    let before_main = git_output(&repo_path, &["rev-parse", "origin/main"]);
    commit_file(&seed_path, "README.md", "remote update\n", "remote update");
    git(&seed_path, &["push", "origin", "main"]);

    assert!(!git_succeeds(
        &repo_path,
        &["show-ref", "--verify", "refs/remotes/origin/extra"]
    ));

    GitEngine::new()
        .fetch(&repo_path)
        .expect("targeted shallow fetch should succeed");

    let after_main = git_output(&repo_path, &["rev-parse", "origin/main"]);
    assert_ne!(before_main, after_main);
    assert!(!git_succeeds(
        &repo_path,
        &["show-ref", "--verify", "refs/remotes/origin/extra"]
    ));

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn git_fetch_targets_non_origin_upstream_for_shallow_repositories() {
    let (root, origin_path) = setup_remote_repo("targeted-shallow-upstream-fetch");
    let repo_path = root.join("shallow-upstream-work");
    let origin_url = file_url(&origin_path);
    git(
        &root,
        &[
            "clone",
            "--depth=1",
            "--branch",
            "main",
            &origin_url,
            repo_path.to_str().expect("valid path"),
        ],
    );
    configure_repo(&repo_path);
    git(&repo_path, &["remote", "add", "upstream", &origin_url]);
    git(&repo_path, &["fetch", "upstream", "main"]);
    git(
        &repo_path,
        &["branch", "--set-upstream-to=upstream/main", "main"],
    );

    let seed_path = root.join("seed");
    let before_upstream = git_output(&repo_path, &["rev-parse", "upstream/main"]);
    commit_file(
        &seed_path,
        "README.md",
        "upstream update\n",
        "upstream update",
    );
    git(&seed_path, &["push", "origin", "main"]);

    GitEngine::new()
        .fetch(&repo_path)
        .expect("targeted shallow fetch should update upstream ref");

    let after_upstream = git_output(&repo_path, &["rev-parse", "upstream/main"]);
    assert_ne!(before_upstream, after_upstream);

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn branch_name_validation_rejects_invalid_names() {
    GitEngine::validate_branch_name("feature/scope").expect("valid branch should pass");

    assert!(GitEngine::validate_branch_name("bad branch").is_err());
    assert!(GitEngine::validate_branch_name("feature.lock").is_err());
    assert!(GitEngine::validate_branch_name("feature/scope ").is_err());
    assert!(GitEngine::validate_branch_name("").is_err());
}

#[test]
fn git_status_reports_equal_remote_default_branch() {
    let (root, origin_path) = setup_remote_repo("equal");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let engine = GitEngine::new();

    let status = engine
        .get_git_status(&repo_path)
        .expect("git status should be available");

    assert_eq!(status.default_branch.as_deref(), Some("main"));
    assert_eq!(status.default_branch_ahead, Some(0));
    assert_eq!(status.default_branch_behind, Some(0));

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn git_status_reports_branch_ahead_of_remote_default_branch() {
    let (root, origin_path) = setup_remote_repo("ahead");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let engine = GitEngine::new();

    git(&repo_path, &["checkout", "-b", "feature"]);
    commit_file(&repo_path, "feature.txt", "feature\n", "feature work");
    git(&repo_path, &["push", "-u", "origin", "feature"]);

    let status = engine
        .get_git_status(&repo_path)
        .expect("git status should be available");

    assert_eq!(status.default_branch.as_deref(), Some("main"));
    assert_eq!(status.default_branch_ahead, Some(1));
    assert_eq!(status.default_branch_behind, Some(0));

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn git_status_reports_branch_behind_remote_default_branch() {
    let (root, origin_path) = setup_remote_repo("behind");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let other_clone_path = clone_repo(&root, &origin_path, "other");
    let engine = GitEngine::new();

    git(&repo_path, &["checkout", "-b", "feature"]);
    git(&repo_path, &["push", "-u", "origin", "feature"]);
    git(&repo_path, &["checkout", "main"]);
    commit_file(&other_clone_path, "remote.txt", "remote\n", "remote update");
    git(&other_clone_path, &["push", "origin", "main"]);
    git(&repo_path, &["fetch", "origin"]);
    git(&repo_path, &["checkout", "feature"]);

    let status = engine
        .get_git_status(&repo_path)
        .expect("git status should be available");

    assert_eq!(status.default_branch.as_deref(), Some("main"));
    assert_eq!(status.default_branch_ahead, Some(0));
    assert_eq!(status.default_branch_behind, Some(1));

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn git_status_reports_unknown_branch_sync_without_upstream() {
    let (root, origin_path) = setup_remote_repo("no-upstream");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let engine = GitEngine::new();

    git(&repo_path, &["checkout", "-b", "feature"]);
    commit_file(&repo_path, "feature.txt", "feature\n", "feature work");

    let status = engine
        .get_git_status(&repo_path)
        .expect("git status should be available");

    assert_eq!(status.default_branch.as_deref(), Some("main"));
    assert_eq!(status.default_branch_ahead, None);
    assert_eq!(status.default_branch_behind, None);

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn git_status_reports_unknown_branch_sync_when_only_tracking_default_branch() {
    let (root, origin_path) = setup_remote_repo("tracking-default-only");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let engine = GitEngine::new();

    git(&repo_path, &["checkout", "-b", "feature"]);
    git(
        &repo_path,
        &["branch", "--set-upstream-to=origin/main", "feature"],
    );

    let status = engine
        .get_git_status(&repo_path)
        .expect("git status should be available");

    assert_eq!(status.default_branch.as_deref(), Some("main"));
    assert_eq!(status.default_branch_ahead, None);
    assert_eq!(status.default_branch_behind, None);

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn git_status_reports_merge_conflicts() {
    let (root, origin_path) = setup_remote_repo("merge-conflicts");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let engine = GitEngine::new();

    git(&repo_path, &["checkout", "-b", "feature"]);
    commit_file(&repo_path, "README.md", "feature change\n", "feature work");
    git(&repo_path, &["checkout", "main"]);
    commit_file(&repo_path, "README.md", "main change\n", "main work");
    git(&repo_path, &["checkout", "feature"]);

    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["merge", "main"])
        .output()
        .expect("git merge should run");
    assert!(!output.status.success(), "merge should produce conflict");

    let status = engine
        .get_git_status(&repo_path)
        .expect("git status should be available");

    assert!(status.has_merge_conflicts);

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn changed_files_preserve_unmerged_status_codes() {
    let (root, origin_path) = setup_remote_repo("merge-conflict-statuses");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let engine = GitEngine::new();

    git(&repo_path, &["checkout", "-b", "feature"]);
    commit_file(&repo_path, "README.md", "feature change\n", "feature work");
    git(&repo_path, &["checkout", "main"]);
    commit_file(&repo_path, "README.md", "main change\n", "main work");
    git(&repo_path, &["checkout", "feature"]);

    let output = Command::new("git")
        .current_dir(&repo_path)
        .args(["merge", "main"])
        .output()
        .expect("git merge should run");
    assert!(!output.status.success(), "merge should produce conflict");

    let changes = engine
        .get_changed_files(&repo_path, None, false)
        .expect("changed files should be available");

    assert!(changes
        .staged_files
        .iter()
        .chain(changes.unstaged_files.iter())
        .any(|file| file.path == "README.md" && file.status == "UU"));

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn preferred_compare_ref_uses_upstream_when_available() {
    let (root, origin_path) = setup_remote_repo("compare-upstream");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let engine = GitEngine::new();

    git(&repo_path, &["checkout", "-b", "feature"]);
    commit_file(&repo_path, "feature.txt", "feature\n", "feature work");
    git(&repo_path, &["push", "-u", "origin", "feature"]);

    let compare_ref = engine
        .resolve_preferred_compare_ref(&repo_path, None)
        .expect("compare ref should resolve");

    assert_eq!(compare_ref.as_deref(), Some("origin/feature"));

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn preferred_compare_ref_falls_back_to_remote_default_branch() {
    let (root, origin_path) = setup_remote_repo("compare-default");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let engine = GitEngine::new();

    git(&repo_path, &["checkout", "-b", "feature"]);
    commit_file(&repo_path, "feature.txt", "feature\n", "feature work");

    let compare_ref = engine
        .resolve_preferred_compare_ref(&repo_path, None)
        .expect("compare ref should resolve");

    assert_eq!(compare_ref.as_deref(), Some("origin/main"));

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn changed_files_compare_ref_accepts_commit_hash_on_clean_tree() {
    let (root, origin_path) = setup_remote_repo("compare-commit");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let engine = GitEngine::new();
    let base_commit = git_output(&repo_path, &["rev-parse", "HEAD"])
        .trim()
        .to_string();

    commit_file(&repo_path, "feature.txt", "feature\n", "feature work");

    let changes = engine
        .get_changed_files(&repo_path, Some(&base_commit), false)
        .expect("changed files should be available");

    assert_eq!(changes.compare_ref.as_deref(), Some(base_commit.as_str()));
    assert_eq!(changes.unstaged_files.len(), 0);
    assert!(changes
        .staged_files
        .iter()
        .any(|file| file.path == "feature.txt" && file.status == "A"));

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn changed_files_for_commit_returns_only_that_commit_patch() {
    let (root, origin_path) = setup_remote_repo("commit-patch");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let engine = GitEngine::new();

    commit_file(&repo_path, "first.txt", "first\n", "first commit");
    let first_commit = git_output(&repo_path, &["rev-parse", "HEAD"])
        .trim()
        .to_string();
    commit_file(&repo_path, "second.txt", "second\n", "second commit");

    let changes = engine
        .get_changed_files_for_commit(&repo_path, &first_commit)
        .expect("commit patch changed files should be available");

    assert!(changes
        .staged_files
        .iter()
        .any(|file| file.path == "first.txt" && file.status == "A"));
    assert!(!changes
        .staged_files
        .iter()
        .any(|file| file.path == "second.txt"));

    let diff = engine
        .get_file_diff_for_commit(&repo_path, "first.txt", &first_commit)
        .expect("commit patch file diff should be available");

    assert_eq!(diff.old_content, "");
    assert_eq!(diff.new_content, "first\n");

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn changed_files_preserve_rename_numstat_counts() {
    let (root, origin_path) = setup_remote_repo("rename-numstat");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let engine = GitEngine::new();

    fs::create_dir_all(repo_path.join("src")).expect("src dir should be created");
    commit_file(&repo_path, "src/old_name.txt", "one\ntwo\n", "add old file");
    let base_commit = git_output(&repo_path, &["rev-parse", "HEAD"])
        .trim()
        .to_string();

    git(&repo_path, &["mv", "src/old_name.txt", "src/new_name.txt"]);
    write_file(&repo_path.join("src/new_name.txt"), "one\ntwo\nthree\n");
    git(&repo_path, &["add", "-A"]);
    git(&repo_path, &["commit", "-m", "rename with edit"]);
    let rename_commit = git_output(&repo_path, &["rev-parse", "HEAD"])
        .trim()
        .to_string();

    git(&repo_path, &["config", "diff.renames", "false"]);

    let branch_changes = engine
        .get_changed_files(&repo_path, Some(&base_commit), false)
        .expect("branch compare changed files should be available");
    let branch_rename = branch_changes
        .staged_files
        .iter()
        .find(|file| file.path == "src/new_name.txt")
        .expect("branch compare should include renamed file");
    assert_eq!(branch_rename.status, "R");
    assert_eq!(branch_rename.additions, 1);
    assert_eq!(branch_rename.deletions, 0);

    let branch_diff = engine
        .get_file_diff(&repo_path, "src/new_name.txt", Some(&base_commit), false)
        .expect("branch compare renamed file diff should be available");
    assert_eq!(branch_diff.status, "R");
    assert_eq!(branch_diff.old_content, "one\ntwo\n");
    assert_eq!(branch_diff.new_content, "one\ntwo\nthree\n");

    let commit_changes = engine
        .get_changed_files_for_commit(&repo_path, &rename_commit)
        .expect("commit patch changed files should be available");
    let commit_rename = commit_changes
        .staged_files
        .iter()
        .find(|file| file.path == "src/new_name.txt")
        .expect("commit patch should include renamed file");
    assert_eq!(commit_rename.status, "R");
    assert_eq!(commit_rename.additions, 1);
    assert_eq!(commit_rename.deletions, 0);

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn changed_files_preserve_literal_arrow_path_numstat_counts() {
    let (root, origin_path) = setup_remote_repo("literal-arrow-numstat");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let engine = GitEngine::new();

    fs::create_dir_all(repo_path.join("src")).expect("src dir should be created");
    commit_file(&repo_path, "src/a => b.txt", "one\n", "add arrow file");
    let base_commit = git_output(&repo_path, &["rev-parse", "HEAD"])
        .trim()
        .to_string();

    commit_file(
        &repo_path,
        "src/a => b.txt",
        "one\ntwo\n",
        "modify arrow file",
    );
    let arrow_commit = git_output(&repo_path, &["rev-parse", "HEAD"])
        .trim()
        .to_string();

    let branch_changes = engine
        .get_changed_files(&repo_path, Some(&base_commit), false)
        .expect("branch compare changed files should be available");
    let branch_file = branch_changes
        .staged_files
        .iter()
        .find(|file| file.path == "src/a => b.txt")
        .expect("branch compare should include literal arrow file");
    assert_eq!(branch_file.status, "M");
    assert_eq!(branch_file.additions, 1);
    assert_eq!(branch_file.deletions, 0);

    let commit_changes = engine
        .get_changed_files_for_commit(&repo_path, &arrow_commit)
        .expect("commit patch changed files should be available");
    let commit_file = commit_changes
        .staged_files
        .iter()
        .find(|file| file.path == "src/a => b.txt")
        .expect("commit patch should include literal arrow file");
    assert_eq!(commit_file.status, "M");
    assert_eq!(commit_file.additions, 1);
    assert_eq!(commit_file.deletions, 0);

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn changed_files_for_merge_commit_uses_first_parent_patch() {
    let (root, origin_path) = setup_remote_repo("merge-commit-patch");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let engine = GitEngine::new();

    git(&repo_path, &["checkout", "-b", "feature"]);
    commit_file(
        &repo_path,
        "feature.txt",
        "feature from branch\n",
        "feature work",
    );
    git(&repo_path, &["checkout", "main"]);
    git(
        &repo_path,
        &["merge", "--no-ff", "feature", "-m", "merge feature"],
    );
    let merge_commit = git_output(&repo_path, &["rev-parse", "HEAD"])
        .trim()
        .to_string();

    let changes = engine
        .get_changed_files_for_commit(&repo_path, &merge_commit)
        .expect("merge commit patch changed files should be available");

    assert!(changes
        .staged_files
        .iter()
        .any(|file| file.path == "feature.txt" && file.status == "A"));

    let diff = engine
        .get_file_diff_for_commit(&repo_path, "feature.txt", &merge_commit)
        .expect("merge commit patch file diff should be available");

    assert_eq!(diff.status, "A");
    assert_eq!(diff.old_content, "");
    assert_eq!(diff.new_content, "feature from branch\n");

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn push_republishes_branch_when_tracking_default_branch() {
    let (root, origin_path) = setup_remote_repo("push-mismatched-upstream");
    let repo_path = clone_repo(&root, &origin_path, "work");
    let engine = GitEngine::new();

    git(&repo_path, &["checkout", "-b", "feature"]);
    git(
        &repo_path,
        &["branch", "--set-upstream-to=origin/main", "feature"],
    );
    commit_file(&repo_path, "feature.txt", "feature\n", "feature work");

    engine.push(&repo_path).expect("push should succeed");

    let upstream = git_output(&repo_path, &["rev-parse", "--abbrev-ref", "@{u}"]);
    assert_eq!(upstream.trim(), "origin/feature");

    let remote_branch = git_output(&repo_path, &["rev-parse", "--verify", "origin/feature"]);
    assert!(!remote_branch.trim().is_empty());

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn apply_patch_to_index_stages_trailing_line() {
    let root = unique_temp_dir("patch-cached");
    let repo_path = root.join("repo");
    fs::create_dir_all(&repo_path).expect("repo dir");
    git(&repo_path, &["init"]);
    configure_repo(&repo_path);
    git(&repo_path, &["branch", "-m", "main"]);
    commit_file(&repo_path, "a.txt", "one\ntwo\n", "init");
    write_file(&repo_path.join("a.txt"), "one\ntwo\nthree\n");

    let patch = git_output(&repo_path, &["diff", "a.txt"]);

    let engine = GitEngine::new();
    engine
        .apply_patch_to_index(&repo_path, &patch)
        .expect("apply cached");

    let staged = git_output(&repo_path, &["show", ":a.txt"]);
    assert!(staged.contains("three"));

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[test]
fn apply_patch_to_worktree_reverse_removes_line() {
    let root = unique_temp_dir("patch-reverse");
    let repo_path = root.join("repo");
    fs::create_dir_all(&repo_path).expect("repo dir");
    git(&repo_path, &["init"]);
    configure_repo(&repo_path);
    git(&repo_path, &["branch", "-m", "main"]);
    commit_file(&repo_path, "a.txt", "one\ntwo\n", "init");
    write_file(&repo_path.join("a.txt"), "one\ntwo\nthree\n");

    let patch = git_output(&repo_path, &["diff", "a.txt"]);

    let engine = GitEngine::new();
    engine
        .apply_patch_to_worktree_reverse(&repo_path, &patch)
        .expect("reverse apply");

    let wt = fs::read_to_string(repo_path.join("a.txt")).expect("read worktree");
    assert!(!wt.contains("three"));

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[cfg(unix)]
#[test]
fn file_diff_reads_symlink_target_instead_of_following_link() {
    use std::os::unix::fs::symlink;

    let root = unique_temp_dir("symlink-diff");
    let repo_path = root.join("repo");
    fs::create_dir_all(&repo_path).expect("repo dir");
    git(&repo_path, &["init"]);
    configure_repo(&repo_path);
    git(&repo_path, &["branch", "-m", "main"]);

    write_file(
        &repo_path.join("AGENTS.md"),
        "actual target file contents\n",
    );
    symlink("AGENTS.md", repo_path.join("CLAUDE.md")).expect("symlink should be created");
    git(&repo_path, &["add", "AGENTS.md", "CLAUDE.md"]);
    git(&repo_path, &["commit", "-m", "add symlink"]);

    let diff = GitEngine::new()
        .get_file_diff(&repo_path, "CLAUDE.md", None, true)
        .expect("file diff should be available");

    assert_eq!(diff.old_content, "AGENTS.md");
    assert_eq!(diff.new_content, "AGENTS.md");

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[cfg(unix)]
#[test]
fn worktree_local_exclude_hides_compensated_symlink_directory() {
    use std::os::unix::fs::symlink;

    let root = unique_temp_dir("worktree-exclude-symlink-dir");
    let repo_path = root.join("repo");
    let external_agent_dir = root.join("external-agent");
    fs::create_dir_all(&repo_path).expect("repo dir");
    fs::create_dir_all(&external_agent_dir).expect("external ignored dir");
    fs::write(external_agent_dir.join("config.json"), "{}\n").expect("ignored file content");

    git(&repo_path, &["init"]);
    configure_repo(&repo_path);
    git(&repo_path, &["branch", "-m", "main"]);
    write_file(&repo_path.join(".gitignore"), ".agent/\n");
    write_file(&repo_path.join("README.md"), "hello\n");
    git(&repo_path, &["add", ".gitignore", "README.md"]);
    git(&repo_path, &["commit", "-m", "init"]);

    symlink(&external_agent_dir, repo_path.join(".agent")).expect("symlink should be created");
    let before = git_output(&repo_path, &["status", "--porcelain", "-uall"]);
    assert_eq!(before.trim(), "?? .agent");

    sync_worktree_local_excludes(&repo_path, &[String::from(".agent")])
        .expect("exclude sync should succeed");

    let after = git_output(&repo_path, &["status", "--porcelain", "-uall"]);
    assert!(
        after.trim().is_empty(),
        "symlink dir should be ignored after worktree-local exclude, got: {after}"
    );

    fs::remove_dir_all(root).expect("temp repo should be removed");
}

#[cfg(unix)]
#[test]
fn worktree_local_exclude_uses_private_gitdir_not_common_dir() {
    use std::os::unix::fs::symlink;

    let root = unique_temp_dir("worktree-private-exclude");
    let repo_path = root.join("repo");
    let worktree_path = root.join("linked-worktree");
    let external_agent_dir = root.join("external-agent");
    fs::create_dir_all(&repo_path).expect("repo dir");
    fs::create_dir_all(&external_agent_dir).expect("external ignored dir");

    git(&repo_path, &["init"]);
    configure_repo(&repo_path);
    git(&repo_path, &["branch", "-m", "main"]);
    write_file(&repo_path.join(".gitignore"), ".agent/\n");
    write_file(&repo_path.join("README.md"), "hello\n");
    git(&repo_path, &["add", ".gitignore", "README.md"]);
    git(&repo_path, &["commit", "-m", "init"]);
    git(
        &repo_path,
        &[
            "worktree",
            "add",
            worktree_path.to_str().expect("valid worktree path"),
        ],
    );

    symlink(&external_agent_dir, worktree_path.join(".agent"))
        .expect("compensated symlink should be created");

    sync_worktree_local_excludes(&worktree_path, &[String::from(".agent")])
        .expect("exclude sync should succeed");

    let private_exclude = repo_path
        .join(".git")
        .join("worktrees")
        .join("linked-worktree")
        .join("info")
        .join("exclude");
    let common_exclude = repo_path.join(".git").join("info").join("exclude");

    let private_contents =
        fs::read_to_string(&private_exclude).expect("private worktree exclude should exist");
    assert!(private_contents.contains(".agent"));

    let common_contents = fs::read_to_string(&common_exclude).unwrap_or_default();
    assert!(
        !common_contents.contains(super::excludes::ATMOS_EXCLUDE_BLOCK_START),
        "common exclude should not receive Atmos worktree-local block"
    );

    let excludes_file = git_output(
        &worktree_path,
        &["config", "--show-origin", "--get", "core.excludesFile"],
    );
    assert!(
        excludes_file.contains("worktrees/linked-worktree"),
        "worktree should use private exclude via core.excludesFile, got: {excludes_file}"
    );

    let ignored = git_output(&worktree_path, &["check-ignore", "-v", ".agent"]);
    assert!(
        ignored.contains(".agent"),
        "linked worktree should ignore compensated symlink, got: {ignored}"
    );

    let status = git_output(&worktree_path, &["status", "--porcelain", "-uall"]);
    assert!(
        status.trim().is_empty(),
        "compensated symlink should be hidden from status, got: {status}"
    );

    fs::remove_dir_all(root).expect("temp repo should be removed");
}
