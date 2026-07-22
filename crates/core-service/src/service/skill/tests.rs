use super::{ScanMode, SkillScanner};
use std::fs;

fn write_skill(skill_dir: &std::path::Path, name: &str) {
    fs::create_dir_all(skill_dir).unwrap();
    fs::write(
        skill_dir.join("SKILL.md"),
        format!("---\nname: {name}\nversion: \"0.1.0\"\ndescription: \"Test\"\n---\n\n# {name}\n"),
    )
    .unwrap();
}

/// Build a `~/.atmos/skills/.system/` layout covering both the direct-subdir skills
/// (e.g. `project-wiki`, `git-commit`) and the nested `code_review_skills/*` skills,
/// then assert `scan_system_skills` emits every SKILL.md-bearing dir with
/// `scope = "system"` and ignores containers without their own `SKILL.md`.
#[test]
fn scan_system_skills_finds_direct_and_nested_skills() {
    let tmp = tempfile::tempdir().expect("create tempdir");
    let fake_home = tmp.path();
    let system_dir = fake_home.join(".atmos").join("skills").join(".system");

    // Direct subdirs: project-wiki, git-commit, atmos-review-fix
    for name in ["project-wiki", "git-commit", "atmos-review-fix"] {
        write_skill(&system_dir.join(name), name);
    }

    // Container dir with nested review skills
    for name in [
        "fullstack-reviewer",
        "code-review-expert",
        "typescript-react-reviewer",
        "custom-review-skill-abc123",
    ] {
        write_skill(&system_dir.join("code_review_skills").join(name), name);
    }

    // Noise: a dir without SKILL.md directly under .system/ must be ignored.
    fs::create_dir_all(system_dir.join("not-a-skill")).unwrap();
    // Noise: a dir without SKILL.md inside code_review_skills must be ignored.
    fs::create_dir_all(
        system_dir
            .join("code_review_skills")
            .join("empty-container"),
    )
    .unwrap();
    // Noise: an unknown container dir with a SKILL.md-bearing child must NOT recurse.
    write_skill(
        &system_dir.join("unknown_container").join("hidden-skill"),
        "hidden-skill",
    );

    let skills = SkillScanner::scan_system_skills_with_mode(fake_home, ScanMode::Full);

    let names: Vec<_> = skills.iter().map(|s| s.name.as_str()).collect();
    for expected in [
        "project-wiki",
        "git-commit",
        "atmos-review-fix",
        "fullstack-reviewer",
        "code-review-expert",
        "typescript-react-reviewer",
        "custom-review-skill-abc123",
    ] {
        assert!(
            names.contains(&expected),
            "expected {expected} in scan output, got {names:?}",
        );
    }
    assert!(
        !names.contains(&"not-a-skill"),
        "dirs without SKILL.md must be skipped, got {names:?}",
    );
    assert!(
        !names.contains(&"empty-container"),
        "nested dirs without SKILL.md must be skipped, got {names:?}",
    );
    assert!(
        !names.contains(&"hidden-skill"),
        "skills under unknown container dirs must be ignored, got {names:?}",
    );

    for skill in &skills {
        assert_eq!(
            skill.scope, "system",
            "skill {} has wrong scope {}",
            skill.name, skill.scope,
        );
    }
}

/// File-level symlinks inside a skill dir must surface as `is_symlink=true` plus the
/// original link target (not its resolved path) so the file-tree UI can badge them.
#[cfg(unix)]
#[test]
fn scan_skill_files_marks_symlinks() {
    let tmp = tempfile::tempdir().expect("create tempdir");
    let fake_home = tmp.path();
    let base = fake_home
        .join(".atmos")
        .join("skills")
        .join(".system")
        .join("code_review_skills");
    fs::create_dir_all(&base).unwrap();

    // Target file lives in a sibling canonical skill.
    let canonical = fake_home
        .join(".atmos")
        .join("skills")
        .join(".system")
        .join("atmos-review-fix")
        .join("references");
    fs::create_dir_all(&canonical).unwrap();
    fs::write(canonical.join("atmos-review-cli.md"), "# Shared CLI ref\n").unwrap();

    // Custom skill with a references/ symlink to the shared file.
    let skill_dir = base.join("custom-review-skill-sym01");
    let refs = skill_dir.join("references");
    fs::create_dir_all(&refs).unwrap();
    fs::write(
        skill_dir.join("SKILL.md"),
        "---\nname: custom-review-skill-sym01\nversion: \"0.1.0\"\ndescription: \"Test\"\n---\n\n# Body\n",
    )
    .unwrap();
    std::os::unix::fs::symlink(
        "../../../atmos-review-fix/references/atmos-review-cli.md",
        refs.join("atmos-review-cli.md"),
    )
    .unwrap();

    let skills = SkillScanner::scan_system_skills_with_mode(fake_home, ScanMode::Full);
    let skill = skills
        .iter()
        .find(|s| s.name == "custom-review-skill-sym01")
        .expect("scaffolded skill missing from scan");

    let linked = skill
        .files
        .iter()
        .find(|f| f.relative_path == "references/atmos-review-cli.md")
        .expect("symlinked reference file missing from skill.files");

    assert!(linked.is_symlink, "expected is_symlink=true for the link");
    assert_eq!(
        linked.symlink_target.as_deref(),
        Some("../../../atmos-review-fix/references/atmos-review-cli.md"),
        "symlink_target should report the raw link value, not a resolved path",
    );

    // SKILL.md itself is a regular file; it must not be flagged as a symlink.
    let skill_md = skill
        .files
        .iter()
        .find(|f| f.relative_path == "SKILL.md")
        .expect("SKILL.md missing");
    assert!(!skill_md.is_symlink);
    assert!(skill_md.symlink_target.is_none());
}

/// Lazy mode must populate `content` for SKILL.md (title/description need it) but
/// leave every other file's `content` as `None`. Full mode keeps content for all.
#[test]
fn scan_lazy_mode_drops_non_main_file_content() {
    let tmp = tempfile::tempdir().expect("create tempdir");
    let fake_home = tmp.path();
    let base = fake_home.join(".atmos").join("skills").join(".system");
    let skill_dir = base.join("test-skill");
    let refs_dir = skill_dir.join("references");
    fs::create_dir_all(&refs_dir).unwrap();
    fs::write(
        skill_dir.join("SKILL.md"),
        "---\nname: test-skill\ndescription: \"desc\"\n---\n\n# body\n",
    )
    .unwrap();
    fs::write(
        refs_dir.join("extra.md"),
        "# extra notes\n\nsome content that Lazy mode should not read\n",
    )
    .unwrap();

    let lazy = SkillScanner::scan_system_skills_with_mode(fake_home, ScanMode::Lazy);
    let skill = lazy
        .iter()
        .find(|s| s.name == "test-skill")
        .expect("test-skill missing in lazy scan");
    let main = skill
        .files
        .iter()
        .find(|f| f.relative_path == "SKILL.md")
        .expect("SKILL.md missing from lazy files");
    let extra = skill
        .files
        .iter()
        .find(|f| f.relative_path == "references/extra.md")
        .expect("non-main file missing from lazy files");

    assert!(
        main.content.is_some(),
        "main file content MUST be read in Lazy mode (title/description depend on it)",
    );
    assert!(
        extra.content.is_none(),
        "non-main file content MUST be skipped in Lazy mode, got {:?}",
        extra.content,
    );

    // Full mode reads every file.
    let full = SkillScanner::scan_system_skills_with_mode(fake_home, ScanMode::Full);
    let full_extra = full
        .iter()
        .find(|s| s.name == "test-skill")
        .unwrap()
        .files
        .iter()
        .find(|f| f.relative_path == "references/extra.md")
        .unwrap()
        .clone();
    assert!(
        full_extra.content.is_some(),
        "Full mode must still read non-main file content, got {:?}",
        full_extra.content,
    );
}

fn write_agent_skill(root: &std::path::Path, agent_skills_rel: &str, name: &str) {
    let skill_dir = root.join(agent_skills_rel).join(name);
    write_skill(&skill_dir, name);
}

#[test]
fn project_disable_moves_skill_into_disabled_storage() {
    use super::SkillManager;

    let tmp = tempfile::tempdir().expect("create tempdir");
    let project = tmp.path().join("project");
    fs::create_dir_all(&project).unwrap();
    write_agent_skill(&project, ".claude/skills", "demo");

    let project_paths = vec![(
        "proj-1".to_string(),
        "Demo".to_string(),
        project.to_string_lossy().to_string(),
    )];
    let skill_id = "project::proj-1::demo";

    SkillManager::set_enabled(&project_paths, skill_id, false, None).expect("disable");

    assert!(!project.join(".claude/skills/demo").exists());
    assert!(project
        .join(".atmos/skills/.disabled/.claude/skills/demo/SKILL.md")
        .exists());

    let skills = SkillScanner::scan_all(&project_paths);
    let skill = skills.iter().find(|s| s.id == skill_id).expect("skill");
    assert_eq!(skill.status, "disabled");

    // Re-enable restores original path.
    SkillManager::set_enabled(&project_paths, skill_id, true, None).expect("enable");
    assert!(project.join(".claude/skills/demo/SKILL.md").exists());
}

#[test]
fn workspace_copy_disable_is_local_to_workplace() {
    use super::{SkillManager, SkillScopeRoot};

    let tmp = tempfile::tempdir().expect("create tempdir");
    let project = tmp.path().join("project");
    let workplace = tmp.path().join("workplace");
    fs::create_dir_all(&project).unwrap();
    fs::create_dir_all(&workplace).unwrap();
    write_agent_skill(&project, ".claude/skills", "demo");
    write_agent_skill(&workplace, ".claude/skills", "demo");

    let root = SkillScopeRoot {
        scope: "workspace".into(),
        id: "ws-1".into(),
        name: "Work".into(),
        path: workplace.to_string_lossy().into(),
    };
    let skill_id = "workspace::ws-1::demo";

    SkillManager::set_enabled_with_extra_roots(&[], &[root.clone()], skill_id, false, None)
        .expect("disable workspace copy");

    assert!(
        project.join(".claude/skills/demo/SKILL.md").exists(),
        "project copy must stay"
    );
    assert!(!workplace.join(".claude/skills/demo").exists());
    assert!(workplace
        .join(".atmos/skills/.disabled/.claude/skills/demo/SKILL.md")
        .exists());

    let skills = SkillScanner::scan_root(&root, ScanMode::Lazy);
    let skill = skills.iter().find(|s| s.id == skill_id).expect("skill");
    assert_eq!(skill.status, "disabled");
}

#[cfg(unix)]
#[test]
fn workspace_parent_symlink_disable_does_not_mutate_project() {
    use super::{SkillManager, SkillScopeRoot};

    let tmp = tempfile::tempdir().expect("create tempdir");
    let project = tmp.path().join("project");
    let workplace = tmp.path().join("workplace");
    fs::create_dir_all(project.join(".claude/skills")).unwrap();
    fs::create_dir_all(&workplace).unwrap();
    write_agent_skill(&project, ".claude/skills", "demo");
    write_agent_skill(&project, ".claude/skills", "keep");

    std::os::unix::fs::symlink(project.join(".claude"), workplace.join(".claude"))
        .expect("compensate parent symlink");

    let root = SkillScopeRoot {
        scope: "workspace".into(),
        id: "ws-1".into(),
        name: "Work".into(),
        path: workplace.to_string_lossy().into(),
    };
    let skill_id = "workspace::ws-1::demo";

    SkillManager::set_enabled_with_extra_roots(&[], &[root.clone()], skill_id, false, None)
        .expect("disable via materialized symlink");

    assert!(
        project.join(".claude/skills/demo/SKILL.md").exists(),
        "project skill must remain after workplace-only disable"
    );
    assert!(
        project.join(".claude/skills/keep/SKILL.md").exists(),
        "sibling project skill must remain"
    );
    assert!(
        !workplace.join(".claude/skills/demo").exists(),
        "workplace must no longer expose enabled demo skill"
    );
    assert!(
        workplace
            .join(".atmos/skills/.disabled/.claude/skills/demo")
            .exists(),
        "disabled storage should hold the moved workplace entry"
    );
    // Sibling remains reachable in workplace via materialized child symlink.
    assert!(workplace.join(".claude/skills/keep/SKILL.md").exists());

    let skills = SkillScanner::scan_root(&root, ScanMode::Lazy);
    let demo = skills.iter().find(|s| s.id == skill_id).expect("demo");
    assert_eq!(demo.status, "disabled");
    let keep = skills
        .iter()
        .find(|s| s.id == "workspace::ws-1::keep")
        .expect("keep");
    assert_eq!(keep.status, "enabled");
}
