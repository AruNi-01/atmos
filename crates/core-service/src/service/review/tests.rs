use super::*;
use infra::db::repo::{ProjectRepo, ReviewRepo};
use sea_orm::Database;
use sea_orm_migration::MigratorTrait;
use std::sync::Arc;

async fn setup_db() -> Arc<sea_orm::DatabaseConnection> {
    let db = Database::connect("sqlite::memory:").await.unwrap();
    infra::Migrator::up(&db, None).await.unwrap();
    Arc::new(db)
}

fn run_cmd_assert_success(cmd: &mut std::process::Command) {
    let output = cmd.output().expect("Command failed to execute");
    assert!(
        output.status.success(),
        "Command failed with status {}: stdout: {}, stderr: {}",
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

// ── S2: resolve_repo_context — project with target_branch set ─────────────

#[tokio::test]
async fn s2_resolve_repo_context_project_target_branch() {
    let db = setup_db().await;
    let tmp = tempfile::tempdir().unwrap();
    let repo_path = tmp.path().to_string_lossy().to_string();

    // Init a bare git repo so GitEngine doesn't fail on get_default_branch
    run_cmd_assert_success(
        &mut std::process::Command::new("git")
            .args(["init", "-b", "main"])
            .current_dir(tmp.path()),
    );

    let project = ProjectRepo::new(&db)
        .create(
            "test-project".into(),
            repo_path.clone(),
            0,
            None,
            Some("main".into()),
        )
        .await
        .unwrap();

    let service = ReviewService::new(db);
    let ctx = service
        .resolve_repo_context(&ReviewTarget::Project {
            project_guid: project.guid.clone(),
        })
        .await
        .unwrap();

    assert_eq!(ctx.project_guid, project.guid);
    assert!(ctx.workspace_guid.is_none());
    assert_eq!(ctx.base_ref.as_deref(), Some("main"));
    assert_eq!(ctx.base_ref_origin, BaseRefOrigin::ProjectTargetBranch);
}

// ── S3: resolve_repo_context — target_branch NULL, origin/HEAD resolves ──

#[tokio::test]
async fn s3_resolve_repo_context_fallback_to_default_branch() {
    let db = setup_db().await;
    let tmp = tempfile::tempdir().unwrap();

    // Init a git repo with a commit so origin/HEAD can be resolved locally
    run_cmd_assert_success(
        &mut std::process::Command::new("git")
            .args(["init", "-b", "main"])
            .current_dir(tmp.path()),
    );
    run_cmd_assert_success(
        &mut std::process::Command::new("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(tmp.path()),
    );
    run_cmd_assert_success(
        &mut std::process::Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(tmp.path()),
    );
    // Create a file and commit so HEAD exists
    std::fs::write(tmp.path().join("README.md"), "test").unwrap();
    run_cmd_assert_success(
        &mut std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(tmp.path()),
    );
    run_cmd_assert_success(
        &mut std::process::Command::new("git")
            .args(["commit", "-m", "init"])
            .current_dir(tmp.path()),
    );

    let repo_path = tmp.path().to_string_lossy().to_string();
    let project = ProjectRepo::new(&db)
        .create("test-project".into(), repo_path, 0, None, None)
        .await
        .unwrap();

    let service = ReviewService::new(db);

    // Capture tracing events to verify warn is emitted
    let subscriber = tracing_subscriber::fmt()
        .with_test_writer()
        .with_max_level(tracing::Level::WARN)
        .finish();
    let _guard = tracing::subscriber::set_default(subscriber);

    let ctx = service
        .resolve_repo_context(&ReviewTarget::Project {
            project_guid: project.guid.clone(),
        })
        .await
        .unwrap();

    assert_eq!(ctx.project_guid, project.guid);
    assert!(ctx.workspace_guid.is_none());
    // base_ref should be Some (the default branch from git)
    assert!(ctx.base_ref.is_some());
    assert_eq!(ctx.base_ref_origin, BaseRefOrigin::DefaultBranchFallback);
}

// ── S4: resolve_repo_context — both target_branch and origin/HEAD missing ─

#[tokio::test]
async fn s4_resolve_repo_context_hard_fail() {
    let db = setup_db().await;
    let tmp = tempfile::tempdir().unwrap();
    // No git init — no remote, no default branch
    let repo_path = tmp.path().to_string_lossy().to_string();

    let project = ProjectRepo::new(&db)
        .create("test-project".into(), repo_path, 0, None, None)
        .await
        .unwrap();

    let service = ReviewService::new(db);
    let result = service
        .resolve_repo_context(&ReviewTarget::Project {
            project_guid: project.guid,
        })
        .await;

    let err = result.unwrap_err();
    assert!(
        err.to_string().contains("target branch"),
        "error should mention target branch: {err}"
    );
}

// ── S5: empty changeset returns validation error ───────────────────────────

#[tokio::test]
async fn s5_create_session_empty_changeset() {
    let db = setup_db().await;
    let bare = tempfile::tempdir().unwrap();
    let work = tempfile::tempdir().unwrap();

    // Create a bare repo to act as the remote
    run_cmd_assert_success(
        &mut std::process::Command::new("git")
            .args(["init", "--bare", "-b", "main"])
            .current_dir(bare.path()),
    );

    // Clone it so we have a proper remote
    run_cmd_assert_success(&mut std::process::Command::new("git").args([
        "clone",
        bare.path().to_str().unwrap(),
        work.path().to_str().unwrap(),
    ]));
    run_cmd_assert_success(
        &mut std::process::Command::new("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(work.path()),
    );
    run_cmd_assert_success(
        &mut std::process::Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(work.path()),
    );
    // Commit and push so origin/main exists
    std::fs::write(work.path().join("README.md"), "test").unwrap();
    run_cmd_assert_success(
        &mut std::process::Command::new("git")
            .args(["add", "."])
            .current_dir(work.path()),
    );
    run_cmd_assert_success(
        &mut std::process::Command::new("git")
            .args(["commit", "-m", "init"])
            .current_dir(work.path()),
    );
    run_cmd_assert_success(
        &mut std::process::Command::new("git")
            .args(["push", "-u", "origin", "main"])
            .current_dir(work.path()),
    );

    let repo_path = work.path().to_string_lossy().to_string();
    let project = ProjectRepo::new(&db)
        .create(
            "test-project".into(),
            repo_path,
            0,
            None,
            Some("main".into()),
        )
        .await
        .unwrap();

    let service = ReviewService::new(db);
    let result = service
        .create_session(CreateReviewSessionInput {
            target: ReviewTarget::Project {
                project_guid: project.guid,
            },
            title: None,
            created_by: None,
        })
        .await;

    let err = result.unwrap_err();
    assert!(
        err.to_string().contains("no changed files"),
        "error should mention no changed files: {err}"
    );
}

// ── S7: list_sessions_by_project returns only project-scoped sessions ─────

#[tokio::test]
async fn s7_list_sessions_by_project_excludes_workspace_sessions() {
    let db = setup_db().await;
    let review_repo = ReviewRepo::new(&db);

    let project_guid = uuid::Uuid::new_v4().to_string();
    let workspace_guid = uuid::Uuid::new_v4().to_string();

    // Create a project-scoped session (workspace_guid = None)
    let project_session = review_repo
        .create_session(
            None,
            None, // project-scoped
            project_guid.clone(),
            "/tmp/repo".into(),
            "/tmp/storage".into(),
            Some("main".into()),
            None,
            "HEAD".into(),
            uuid::Uuid::new_v4().to_string(),
            "active".into(),
            None,
            None,
        )
        .await
        .unwrap();

    // Create a workspace-scoped session (workspace_guid = Some)
    review_repo
        .create_session(
            None,
            Some(workspace_guid.clone()),
            project_guid.clone(),
            "/tmp/worktree".into(),
            "/tmp/storage2".into(),
            Some("main".into()),
            None,
            "HEAD".into(),
            uuid::Uuid::new_v4().to_string(),
            "active".into(),
            None,
            None,
        )
        .await
        .unwrap();

    let sessions = review_repo
        .list_sessions_by_project(&project_guid, false)
        .await
        .unwrap();

    assert_eq!(
        sessions.len(),
        1,
        "should return exactly one project-scoped session"
    );
    assert_eq!(sessions[0].guid, project_session.guid);
    assert!(sessions[0].workspace_guid.is_none());
}

// ── S8: workspace flow unchanged ──────────────────────────────────────────

#[tokio::test]
async fn s8_workspace_session_has_workspace_guid() {
    let db = setup_db().await;
    let review_repo = ReviewRepo::new(&db);

    let project_guid = uuid::Uuid::new_v4().to_string();
    let workspace_guid = uuid::Uuid::new_v4().to_string();

    let session = review_repo
        .create_session(
            None,
            Some(workspace_guid.clone()),
            project_guid.clone(),
            "/tmp/worktree".into(),
            "/tmp/storage".into(),
            Some("feature".into()),
            None,
            "HEAD".into(),
            uuid::Uuid::new_v4().to_string(),
            "active".into(),
            None,
            None,
        )
        .await
        .unwrap();

    assert_eq!(session.workspace_guid, Some(workspace_guid.clone()));
    assert_eq!(session.project_guid, project_guid);

    let sessions = review_repo
        .list_sessions_by_workspace(&workspace_guid, false)
        .await
        .unwrap();

    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].guid, session.guid);
}

// ── S9: coexistence — project + workspace sessions are independent ─────────

#[tokio::test]
async fn s9_project_and_workspace_sessions_coexist() {
    let db = setup_db().await;
    let review_repo = ReviewRepo::new(&db);

    let project_guid = uuid::Uuid::new_v4().to_string();
    let workspace_guid = uuid::Uuid::new_v4().to_string();

    // Project-scoped session
    let project_session = review_repo
        .create_session(
            None,
            None,
            project_guid.clone(),
            "/tmp/repo".into(),
            "/tmp/storage-p".into(),
            Some("main".into()),
            None,
            "HEAD".into(),
            uuid::Uuid::new_v4().to_string(),
            "active".into(),
            None,
            None,
        )
        .await
        .unwrap();

    // Workspace-scoped session
    let workspace_session = review_repo
        .create_session(
            None,
            Some(workspace_guid.clone()),
            project_guid.clone(),
            "/tmp/worktree".into(),
            "/tmp/storage-w".into(),
            Some("feature".into()),
            None,
            "HEAD".into(),
            uuid::Uuid::new_v4().to_string(),
            "active".into(),
            None,
            None,
        )
        .await
        .unwrap();

    // list_sessions_by_project returns only the project session
    let project_sessions = review_repo
        .list_sessions_by_project(&project_guid, false)
        .await
        .unwrap();
    assert_eq!(project_sessions.len(), 1);
    assert_eq!(project_sessions[0].guid, project_session.guid);

    // list_sessions_by_workspace returns only the workspace session
    let workspace_sessions = review_repo
        .list_sessions_by_workspace(&workspace_guid, false)
        .await
        .unwrap();
    assert_eq!(workspace_sessions.len(), 1);
    assert_eq!(workspace_sessions[0].guid, workspace_session.guid);
}

#[tokio::test]
async fn s10_review_prompt_includes_skill_path_instruction() {
    let service = ReviewService::new(setup_db().await);
    let session = review_session::Model {
        guid: "session-1".into(),
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
        is_deleted: false,
        workspace_guid: None,
        project_guid: "project-1".into(),
        repo_path: "/tmp/repo".into(),
        storage_root_rel_path: "/tmp/storage".into(),
        base_ref: Some("main".into()),
        base_commit: None,
        head_commit: "HEAD".into(),
        current_revision_guid: "revision-2".into(),
        status: "active".into(),
        title: None,
        created_by: None,
        closed_at: None,
        archived_at: None,
    };
    let run = review_agent_run::Model {
        guid: "run-1".into(),
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
        is_deleted: false,
        session_guid: session.guid.clone(),
        base_revision_guid: "revision-1".into(),
        result_revision_guid: Some("revision-2".into()),
        run_kind: "review".into(),
        execution_mode: "copy_prompt".into(),
        skill_id: Some("fullstack-reviewer".into()),
        prompt_rel_path: None,
        result_rel_path: None,
        patch_rel_path: None,
        summary_rel_path: None,
        agent_session_ref: None,
        finalize_attempts: 0,
        failure_reason: None,
        status: "pending".into(),
        started_at: None,
        finished_at: None,
        created_by: None,
    };
    let base_revision = review_revision::Model {
        guid: "revision-1".into(),
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
        is_deleted: false,
        session_guid: session.guid.clone(),
        parent_revision_guid: None,
        source_kind: "initial".into(),
        agent_run_guid: None,
        title: Some("Initial Review".into()),
        storage_root_rel_path: "/tmp/revision".into(),
        base_revision_guid: None,
        created_by: None,
    };

    let prompt = service
        .render_review_prompt(&session, &run, &base_revision, &[])
        .unwrap();

    assert!(prompt.contains("Before reviewing code, read and follow"));
    assert!(prompt.contains("code_review_skills/fullstack-reviewer"));
}
