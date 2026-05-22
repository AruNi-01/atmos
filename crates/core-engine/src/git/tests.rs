use super::{GitEngine, sync_worktree_local_excludes};
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

    assert!(
        changes
            .staged_files
            .iter()
            .chain(changes.unstaged_files.iter())
            .any(|file| file.path == "README.md" && file.status == "UU")
    );

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
