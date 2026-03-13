//! Sync bundled or source-controlled system skills to `~/.atmos/skills/.system/`.
//! 1. In desktop release mode, read from the bundled `ATMOS_SYSTEM_SKILLS_DIR` resource.
//! 2. In source development mode, read from the workspace `skills/` directory.
//! 3. If both are unavailable, fetch skill files from `raw.githubusercontent.com`.
//! 4. Missing skills are warned and skipped; startup must stay non-fatal.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;

use serde::Deserialize;
use tracing::{info, warn};

const BUNDLED_SYSTEM_SKILLS_DIR_ENV: &str = "ATMOS_SYSTEM_SKILLS_DIR";
const RAW_GITHUB_OWNER_ENV: &str = "ATMOS_SYSTEM_SKILLS_GITHUB_OWNER";
const RAW_GITHUB_REPO_ENV: &str = "ATMOS_SYSTEM_SKILLS_GITHUB_REPO";
const RAW_GITHUB_REF_ENV: &str = "ATMOS_SYSTEM_SKILLS_GITHUB_REF";
const DEFAULT_RAW_GITHUB_OWNER: &str = "AruNi-01";
const DEFAULT_RAW_GITHUB_REPO: &str = "atmos";
const DEFAULT_RAW_GITHUB_REF: &str = "main";
const RAW_MANIFEST_REPO_PATH: &str = "skills/system-skills-manifest.json";

static RAW_MANIFEST_CACHE: OnceLock<Result<RawSystemSkillsManifest, String>> = OnceLock::new();

/// All system skills that should be synced to ~/.atmos/skills/.system/ on startup.
const ALL_SYSTEM_SKILL_NAMES: &[&str] = &[
    // Wiki skills
    "project-wiki",
    "project-wiki-update",
    "project-wiki-specify",
    // Code review skills
    "fullstack-reviewer",
    "code-review-expert",
    "typescript-react-reviewer",
    // Git skills
    "git-commit",
];

#[derive(Clone, Debug, Deserialize)]
struct RawSystemSkillsManifest {
    files: HashMap<String, Vec<String>>,
}

/// Recursively copy directory. Symlinks are preserved with their target path unchanged;
/// since project-wiki is synced first, relative symlinks (e.g. ../project-wiki/references) resolve correctly.
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if ty.is_symlink() {
            let target = std::fs::read_link(&path)?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(&target, &dst_path)?;
            #[cfg(windows)]
            {
                let target_is_dir = std::fs::metadata(&path)
                    .map(|m| m.is_dir())
                    .unwrap_or(false);
                if target_is_dir {
                    std::os::windows::fs::symlink_dir(&target, &dst_path)?;
                } else {
                    std::os::windows::fs::symlink_file(&target, &dst_path)?;
                }
            }
        } else if ty.is_dir() {
            copy_dir_all(&path, &dst_path)?;
        } else {
            std::fs::copy(&path, dst_path)?;
        }
    }
    Ok(())
}

/// Check if a skill directory is valid (has SKILL.md). Empty dirs are considered invalid.
fn skill_dir_is_valid(skill_path: &Path) -> bool {
    skill_path.join("SKILL.md").exists()
}

/// Helper function to determine the target directory for a skill.
fn get_target_dir(system_dir: &Path, skill_name: &str) -> PathBuf {
    let review_skills = [
        "fullstack-reviewer",
        "code-review-expert",
        "typescript-react-reviewer",
    ];
    if review_skills.contains(&skill_name) {
        system_dir.join("code_review_skills").join(skill_name)
    } else {
        system_dir.join(skill_name)
    }
}

fn repo_skill_root(skill_name: &str) -> Option<&'static str> {
    match skill_name {
        "project-wiki" => Some("skills/project-wiki"),
        "project-wiki-update" => Some("skills/project-wiki-update"),
        "project-wiki-specify" => Some("skills/project-wiki-specify"),
        "fullstack-reviewer" => Some("skills/code_review_skills/fullstack-reviewer"),
        "code-review-expert" => Some("skills/code_review_skills/code-review-expert"),
        "typescript-react-reviewer" => Some("skills/code_review_skills/typescript-react-reviewer"),
        "git-commit" => Some("skills/git-commit"),
        _ => None,
    }
}

fn find_skill_source(skills_root: &Path, skill_name: &str) -> Option<PathBuf> {
    let direct = skills_root.join(skill_name);
    if direct.is_dir() {
        return Some(direct);
    }

    let dir_entries = std::fs::read_dir(skills_root).ok()?;
    for entry in dir_entries.filter_map(Result::ok) {
        if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
            let nested = entry.path().join(skill_name);
            if nested.is_dir() {
                return Some(nested);
            }
        }
    }

    None
}

fn sync_skill_from_root(
    skill_name: &str,
    system_dir: &Path,
    skills_root: &Path,
    source_label: &str,
) -> bool {
    let target_dir = get_target_dir(system_dir, skill_name);
    if target_dir.exists() && skill_dir_is_valid(&target_dir) {
        return true;
    }

    let Some(source_dir) = find_skill_source(skills_root, skill_name) else {
        return false;
    };

    if target_dir.exists() {
        let _ = std::fs::remove_dir_all(&target_dir);
    }

    match copy_dir_all(&source_dir, &target_dir) {
        Ok(()) => {
            info!(
                "Synced {} skill to {} ({})",
                skill_name,
                target_dir.display(),
                source_label
            );
            true
        }
        Err(error) => {
            warn!(
                "Failed to copy skill {} from {} to {}: {}",
                skill_name,
                source_dir.display(),
                target_dir.display(),
                error
            );
            false
        }
    }
}

fn bundled_skills_dir() -> Option<PathBuf> {
    let bundled_dir = std::env::var_os(BUNDLED_SYSTEM_SKILLS_DIR_ENV).map(PathBuf::from)?;
    if bundled_dir.is_dir() {
        Some(bundled_dir)
    } else {
        warn!(
            "Bundled system skills dir is missing or invalid: {}",
            bundled_dir.display()
        );
        None
    }
}

fn is_workspace_root(path: &Path) -> bool {
    path.join("skills").join("project-wiki").is_dir()
}

fn source_project_root() -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(target_dir) = exe.parent() {
            if let Some(build_kind_dir) = target_dir.parent() {
                if let Some(workspace_root) = build_kind_dir.parent() {
                    if is_workspace_root(workspace_root) {
                        return Some(workspace_root.to_path_buf());
                    }
                }
            }
        }
    }

    let cwd = std::env::current_dir().ok()?;
    if is_workspace_root(&cwd) {
        Some(cwd)
    } else {
        None
    }
}

fn source_skills_dir() -> Option<PathBuf> {
    source_project_root().map(|root| root.join("skills"))
}

fn raw_github_owner() -> String {
    std::env::var(RAW_GITHUB_OWNER_ENV).unwrap_or_else(|_| DEFAULT_RAW_GITHUB_OWNER.to_string())
}

fn raw_github_repo() -> String {
    std::env::var(RAW_GITHUB_REPO_ENV).unwrap_or_else(|_| DEFAULT_RAW_GITHUB_REPO.to_string())
}

fn raw_github_ref() -> String {
    std::env::var(RAW_GITHUB_REF_ENV).unwrap_or_else(|_| DEFAULT_RAW_GITHUB_REF.to_string())
}

fn raw_github_file_url(repo_path: &str) -> String {
    format!(
        "https://raw.githubusercontent.com/{}/{}/{}/{}",
        raw_github_owner(),
        raw_github_repo(),
        raw_github_ref(),
        repo_path
    )
}

fn raw_http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("atmos-system-skill-sync")
        .build()
        .map_err(|error| format!("failed to build HTTP client: {}", error))
}

fn raw_manifest() -> Result<&'static RawSystemSkillsManifest, String> {
    let manifest_result = RAW_MANIFEST_CACHE.get_or_init(|| {
        let client = raw_http_client()?;
        let response = client
            .get(raw_github_file_url(RAW_MANIFEST_REPO_PATH))
            .send()
            .map_err(|error| format!("failed to download manifest: {}", error))?;
        let response = response
            .error_for_status()
            .map_err(|error| format!("manifest request failed: {}", error))?;
        response
            .json::<RawSystemSkillsManifest>()
            .map_err(|error| format!("failed to parse manifest JSON: {}", error))
    });

    manifest_result.as_ref().map_err(Clone::clone)
}

fn write_downloaded_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create parent dir {}: {}",
                parent.display(),
                error
            )
        })?;
    }

    std::fs::write(path, bytes)
        .map_err(|error| format!("failed to write file {}: {}", path.display(), error))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        if path
            .components()
            .any(|component| component.as_os_str() == "scripts")
        {
            let permissions = std::fs::Permissions::from_mode(0o755);
            std::fs::set_permissions(path, permissions).map_err(|error| {
                format!(
                    "failed to set executable permissions on {}: {}",
                    path.display(),
                    error
                )
            })?;
        }
    }

    Ok(())
}

fn sync_skill_from_raw_github(skill_name: &str, system_dir: &Path) -> bool {
    let target_dir = get_target_dir(system_dir, skill_name);
    let Some(skill_root) = repo_skill_root(skill_name) else {
        warn!("No raw GitHub skill root mapping for '{}'", skill_name);
        return false;
    };

    let manifest = match raw_manifest() {
        Ok(manifest) => manifest,
        Err(error) => {
            warn!(
                "Failed to load system skills manifest from raw GitHub: {}",
                error
            );
            return false;
        }
    };

    let Some(files) = manifest.files.get(skill_name) else {
        warn!(
            "Raw GitHub manifest does not list files for '{}'",
            skill_name
        );
        return false;
    };

    if target_dir.exists() {
        let _ = std::fs::remove_dir_all(&target_dir);
    }

    let client = match raw_http_client() {
        Ok(client) => client,
        Err(error) => {
            warn!("Failed to create raw GitHub HTTP client: {}", error);
            return false;
        }
    };

    for repo_path in files {
        let Some(relative_path) = repo_path
            .strip_prefix(skill_root)
            .and_then(|path| path.strip_prefix('/'))
        else {
            warn!(
                "Manifest path '{}' is not under expected skill root '{}'",
                repo_path, skill_root
            );
            let _ = std::fs::remove_dir_all(&target_dir);
            return false;
        };

        let destination = target_dir.join(relative_path);
        let response = match client.get(raw_github_file_url(repo_path)).send() {
            Ok(response) => response,
            Err(error) => {
                warn!(
                    "Failed to download {} from raw GitHub: {}",
                    repo_path, error
                );
                let _ = std::fs::remove_dir_all(&target_dir);
                return false;
            }
        };

        let response = match response.error_for_status() {
            Ok(response) => response,
            Err(error) => {
                warn!("Raw GitHub request failed for {}: {}", repo_path, error);
                let _ = std::fs::remove_dir_all(&target_dir);
                return false;
            }
        };

        let bytes = match response.bytes() {
            Ok(bytes) => bytes,
            Err(error) => {
                warn!(
                    "Failed to read raw GitHub response for {}: {}",
                    repo_path, error
                );
                let _ = std::fs::remove_dir_all(&target_dir);
                return false;
            }
        };

        if let Err(error) = write_downloaded_file(&destination, bytes.as_ref()) {
            warn!("{}", error);
            let _ = std::fs::remove_dir_all(&target_dir);
            return false;
        }
    }

    if skill_dir_is_valid(&target_dir) {
        info!(
            "Synced {} skill to {} (from raw.githubusercontent.com)",
            skill_name,
            target_dir.display()
        );
        true
    } else {
        warn!(
            "Raw GitHub sync for '{}' completed without a valid SKILL.md at {}",
            skill_name,
            target_dir.display()
        );
        let _ = std::fs::remove_dir_all(&target_dir);
        false
    }
}

fn sync_skill_from_available_sources(skill_name: &str, system_dir: &Path) -> bool {
    if std::env::var_os(BUNDLED_SYSTEM_SKILLS_DIR_ENV).is_some() {
        if let Some(skills_root) = bundled_skills_dir() {
            if sync_skill_from_root(
                skill_name,
                system_dir,
                &skills_root,
                "from bundled resource",
            ) {
                return true;
            }
        }
    } else if let Some(skills_root) = source_skills_dir() {
        if sync_skill_from_root(
            skill_name,
            system_dir,
            &skills_root,
            "from source workspace",
        ) {
            return true;
        }
    }

    sync_skill_from_raw_github(skill_name, system_dir)
}

fn warn_missing_skill(skill_name: &str) {
    warn!(
        "System skill '{}' is unavailable from bundled resources, source workspace, or raw.githubusercontent.com fallback. Startup continues without it.",
        skill_name
    );
}

/// Sync a single system skill on demand (e.g. triggered by user clicking "Install Now").
/// Returns Ok(()) on success, Err with message on failure.
///
/// **Blocking**: uses std::fs and blocking HTTP. Callers in async contexts must wrap this in
/// `tokio::task::spawn_blocking`.
pub fn sync_single_system_skill(skill_name: &str) -> Result<(), String> {
    if !ALL_SYSTEM_SKILL_NAMES.contains(&skill_name) {
        return Err(format!("Unknown system skill: {}", skill_name));
    }

    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let system_dir = home.join(".atmos").join("skills").join(".system");
    std::fs::create_dir_all(&system_dir)
        .map_err(|e| format!("Failed to create system skills dir: {}", e))?;

    let target_dir = get_target_dir(&system_dir, skill_name);
    if skill_dir_is_valid(&target_dir) {
        return Ok(());
    }

    if sync_skill_from_available_sources(skill_name, &system_dir) {
        return Ok(());
    }

    warn_missing_skill(skill_name);
    Err(format!(
        "Failed to sync skill '{}': bundled, source, and raw GitHub fallbacks were all unavailable",
        skill_name
    ))
}

/// Ensure all system skills exist in ~/.atmos/skills/.system/.
///
/// **Blocking**: uses std::fs and blocking HTTP. Callers in async contexts must wrap this in
/// `tokio::task::spawn_blocking`.
pub fn sync_system_skills_on_startup() {
    let home = match dirs::home_dir() {
        Some(home) => home,
        None => return,
    };

    let system_dir = home.join(".atmos").join("skills").join(".system");
    if let Err(error) = std::fs::create_dir_all(&system_dir) {
        warn!(
            "Failed to create system skills dir {}: {}",
            system_dir.display(),
            error
        );
        return;
    }

    for skill_name in ALL_SYSTEM_SKILL_NAMES {
        let target_dir = get_target_dir(&system_dir, skill_name);
        if skill_dir_is_valid(&target_dir) {
            continue;
        }

        if !sync_skill_from_available_sources(skill_name, &system_dir) {
            warn_missing_skill(skill_name);
        }
    }
}
