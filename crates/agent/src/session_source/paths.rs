//! Default CLI homes and env-override candidates for v1 hosts.
//!
//! Env paths are used only when they exist and contain real session files;
//! otherwise the default home is used.

use std::path::{Path, PathBuf};

use super::scan;

pub fn env_dir_candidate(
    env_var: &str,
    looks_like_sessions: impl Fn(&Path) -> bool,
) -> Option<PathBuf> {
    let path = env_os(env_var)?;
    env_dir_if_sessions(Some(path.as_path()), looks_like_sessions)
}

pub(crate) fn env_dir_if_sessions(
    env_path: Option<&Path>,
    looks_like_sessions: impl Fn(&Path) -> bool,
) -> Option<PathBuf> {
    let path = env_path?;
    if path.exists() && looks_like_sessions(path) {
        Some(path.to_path_buf())
    } else {
        None
    }
}

pub fn claude_data_roots() -> Vec<PathBuf> {
    let config = env_dir_candidate("CLAUDE_CONFIG_DIR", |config| {
        looks_like_claude_projects(&config.join("projects"))
    });
    claude_data_roots_in(dirs::home_dir().as_deref(), config.as_deref())
}

pub fn codex_data_roots() -> Vec<PathBuf> {
    let codex_home = env_dir_candidate("CODEX_HOME", looks_like_codex_home);
    codex_data_roots_in(dirs::home_dir().as_deref(), codex_home.as_deref())
}

pub fn opencode_data_roots() -> Vec<PathBuf> {
    let opencode_dir = env_dir_candidate("OPENCODE_DIR", looks_like_opencode_root);
    let xdg_data_home = env_dir_candidate("XDG_DATA_HOME", |xdg| {
        looks_like_opencode_root(&xdg.join("opencode"))
    });
    opencode_data_roots_in(
        dirs::home_dir().as_deref(),
        opencode_dir.as_deref(),
        xdg_data_home.as_deref(),
    )
}

pub fn pi_data_roots() -> Vec<PathBuf> {
    pi_data_roots_in(dirs::home_dir().as_deref())
}

pub fn grok_data_roots() -> Vec<PathBuf> {
    grok_data_roots_in(dirs::home_dir().as_deref())
}

pub fn cursor_data_roots() -> Vec<PathBuf> {
    cursor_data_roots_in(dirs::home_dir().as_deref())
}

pub(crate) fn claude_data_roots_in(
    home: Option<&Path>,
    claude_config_dir: Option<&Path>,
) -> Vec<PathBuf> {
    // CLAUDE_CONFIG_DIR re-roots so projects live at {config_dir}/projects.
    if let Some(config) = env_dir_if_sessions(claude_config_dir, |config| {
        looks_like_claude_projects(&config.join("projects"))
    }) {
        return vec![config.join("projects")];
    }
    home.map(|home| home.join(".claude").join("projects"))
        .into_iter()
        .collect()
}

pub(crate) fn codex_data_roots_in(home: Option<&Path>, codex_home: Option<&Path>) -> Vec<PathBuf> {
    let root = env_dir_if_sessions(codex_home, looks_like_codex_home)
        .or_else(|| home.map(|home| home.join(".codex")));
    match root {
        Some(root) => vec![root.join("sessions"), root.join("archived_sessions")],
        None => Vec::new(),
    }
}

pub(crate) fn opencode_data_roots_in(
    home: Option<&Path>,
    opencode_dir: Option<&Path>,
    xdg_data_home: Option<&Path>,
) -> Vec<PathBuf> {
    if let Some(dir) = env_dir_if_sessions(opencode_dir, looks_like_opencode_root) {
        return vec![dir];
    }
    if let Some(xdg) = env_dir_if_sessions(xdg_data_home, |xdg| {
        looks_like_opencode_root(&xdg.join("opencode"))
    }) {
        return vec![xdg.join("opencode")];
    }
    home.map(|home| home.join(".local").join("share").join("opencode"))
        .into_iter()
        .collect()
}

pub(crate) fn pi_data_roots_in(home: Option<&Path>) -> Vec<PathBuf> {
    home.map(|home| home.join(".pi").join("agent").join("sessions"))
        .into_iter()
        .collect()
}

pub(crate) fn grok_data_roots_in(home: Option<&Path>) -> Vec<PathBuf> {
    home.map(|home| home.join(".grok").join("sessions"))
        .into_iter()
        .collect()
}

pub(crate) fn cursor_data_roots_in(home: Option<&Path>) -> Vec<PathBuf> {
    home.map(|home| home.join(".cursor").join("projects"))
        .into_iter()
        .collect()
}

fn env_os(name: &str) -> Option<PathBuf> {
    let value = std::env::var_os(name)?;
    if value.is_empty() {
        None
    } else {
        Some(PathBuf::from(value))
    }
}

fn looks_like_claude_projects(projects: &Path) -> bool {
    scan::has_extension(projects, "jsonl", 4)
}

fn looks_like_codex_home(home: &Path) -> bool {
    scan::dir_nonempty(&home.join("sessions"))
        || scan::dir_nonempty(&home.join("archived_sessions"))
}

fn looks_like_opencode_root(root: &Path) -> bool {
    root.join("opencode.db").is_file()
        || root.join("opencode-next.db").is_file()
        || scan::has_extension(&root.join("storage"), "json", 6)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn env_dir_candidate_requires_existing_layout() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(env_dir_if_sessions(Some(tmp.path()), |_| false).is_none());
        assert_eq!(
            env_dir_if_sessions(Some(tmp.path()), |_| true).as_deref(),
            Some(tmp.path())
        );
        assert!(env_dir_if_sessions(Some(Path::new("/no/such/host-home")), |_| true).is_none());
        assert!(env_dir_if_sessions(None, |_| true).is_none());
    }

    #[test]
    fn claude_config_dir_re_roots_projects_when_jsonl_present() {
        let tmp = tempfile::tempdir().unwrap();
        let config = tmp.path();
        let projects = config.join("projects").join("encoded-cwd");
        fs::create_dir_all(&projects).unwrap();
        fs::write(projects.join("sess.jsonl"), b"{}").unwrap();
        let home = tmp.path().join("home");
        let roots = claude_data_roots_in(Some(&home), Some(config));
        assert_eq!(roots, vec![config.join("projects")]);
    }

    #[test]
    fn claude_empty_config_dir_falls_back_to_default_home() {
        let tmp = tempfile::tempdir().unwrap();
        let config = tmp.path().join("config");
        fs::create_dir_all(&config).unwrap();
        let home = tmp.path().join("home");
        let roots = claude_data_roots_in(Some(&home), Some(&config));
        assert_eq!(roots, vec![home.join(".claude").join("projects")]);
    }

    #[test]
    fn codex_home_candidate_needs_sessions_or_archive() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join("home");
        let empty = tmp.path().join("empty-codex");
        fs::create_dir_all(&empty).unwrap();
        let roots = codex_data_roots_in(Some(&home), Some(&empty));
        assert_eq!(
            roots,
            vec![
                home.join(".codex").join("sessions"),
                home.join(".codex").join("archived_sessions"),
            ]
        );

        fs::create_dir_all(empty.join("sessions")).unwrap();
        fs::write(empty.join("sessions").join("rollout-1.jsonl"), b"").unwrap();
        let roots = codex_data_roots_in(Some(&home), Some(&empty));
        assert_eq!(
            roots,
            vec![empty.join("sessions"), empty.join("archived_sessions")]
        );
    }

    #[test]
    fn opencode_prefers_opencode_dir_then_xdg() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join("home");
        let xdg = tmp.path().join("xdg");
        let custom = tmp.path().join("custom");
        fs::create_dir_all(xdg.join("opencode")).unwrap();
        fs::write(xdg.join("opencode").join("opencode.db"), b"").unwrap();
        fs::create_dir_all(&custom).unwrap();
        fs::write(custom.join("opencode-next.db"), b"").unwrap();

        let roots = opencode_data_roots_in(Some(&home), Some(&custom), Some(&xdg));
        assert_eq!(roots, vec![custom]);

        let empty = tmp.path().join("empty-open");
        fs::create_dir_all(&empty).unwrap();
        let roots = opencode_data_roots_in(Some(&home), Some(&empty), Some(&xdg));
        assert_eq!(roots, vec![xdg.join("opencode")]);

        let roots = opencode_data_roots_in(Some(&home), None, None);
        assert_eq!(
            roots,
            vec![home.join(".local").join("share").join("opencode")]
        );
    }

    #[test]
    fn default_homes_without_env() {
        let home = Path::new("/tmp/atmos-home");
        assert_eq!(
            pi_data_roots_in(Some(home)),
            vec![home.join(".pi").join("agent").join("sessions")]
        );
        assert_eq!(
            grok_data_roots_in(Some(home)),
            vec![home.join(".grok").join("sessions")]
        );
        assert_eq!(
            cursor_data_roots_in(Some(home)),
            vec![home.join(".cursor").join("projects")]
        );
    }
}
