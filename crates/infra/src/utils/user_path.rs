//! User CLI PATH helpers for GUI-launched Atmos Server processes.
//!
//! macOS .app / Electron launches often inherit a minimal PATH that omits
//! Homebrew (`/opt/homebrew/bin`) and other user package managers. That makes
//! `Command::new("tmux")` / `gh` fail even when tools are installed for the user.

use std::env;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use tracing::info;

/// Merge login-shell PATH + common user bin dirs into this process's `PATH`.
///
/// Call once, synchronously, from API `main` before handlers/tasks spawn.
pub fn ensure_user_cli_path_on_startup() -> Result<(), String> {
    let joined = build_user_cli_path()?;
    // SAFETY: only invoked once from API main before concurrent env readers exist
    // (same contract as `atmos_cli::ensure_atmos_cli_on_startup`).
    unsafe {
        env::set_var("PATH", &joined);
    }
    info!(
        "Augmented process PATH for user CLI tools (tmux/gh/git/brew). PATH length={}",
        joined.len()
    );
    Ok(())
}

/// Cached PATH suitable for child processes (login shell + common bins + env).
pub fn user_cli_path() -> &'static OsStr {
    static PATH: OnceLock<OsString> = OnceLock::new();
    PATH.get_or_init(|| build_user_cli_path().unwrap_or_else(|_| env::var_os("PATH").unwrap_or_default()))
        .as_os_str()
}

/// `std::process::Command` that resolves `program` on the user CLI PATH.
pub fn command(program: &str) -> Command {
    let mut cmd = match resolve_binary(program) {
        Some(path) => Command::new(path),
        None => Command::new(program),
    };
    cmd.env("PATH", user_cli_path());
    cmd
}

/// Whether `program --version` (or `-V` fallback) succeeds on the user CLI PATH.
pub fn command_exists(program: &str) -> bool {
    if let Some(path) = resolve_binary(program) {
        if path.is_file() {
            return true;
        }
    }
    // Some tools only expose -V (tmux); prefer existence of a resolved path first.
    command(program)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
        || command(program)
            .arg("-V")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
}

/// Find an absolute path to `program` using the user CLI search path.
pub fn resolve_binary(program: &str) -> Option<PathBuf> {
    let program = program.trim();
    if program.is_empty() {
        return None;
    }
    if program.contains(std::path::MAIN_SEPARATOR) || program.starts_with('~') {
        let path = expand_home(program)?;
        return is_executable(&path).then_some(path);
    }

    for dir in search_path_dirs() {
        let candidate = dir.join(program);
        if is_executable(&candidate) {
            return Some(candidate);
        }
    }
    None
}

/// Build an ordered, deduped PATH (login shell first, then common bins, then current PATH).
pub fn build_user_cli_path() -> Result<OsString, String> {
    let mut paths: Vec<PathBuf> = Vec::new();

    if let Some(shell_path) = resolve_login_shell_path() {
        paths.extend(env::split_paths(OsStr::new(&shell_path)));
    }

    paths.extend(common_user_bin_paths());
    paths.extend(env::split_paths(&env::var_os("PATH").unwrap_or_default()));

    let deduped = dedupe_paths(paths);
    env::join_paths(deduped).map_err(|e| format!("failed to join PATH entries: {e}"))
}

fn search_path_dirs() -> Vec<PathBuf> {
    dedupe_paths(
        env::split_paths(user_cli_path())
            .chain(common_user_bin_paths())
            .collect(),
    )
}

fn common_user_bin_paths() -> Vec<PathBuf> {
    let mut paths = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/opt/homebrew/sbin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/local/sbin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
    ];
    if let Some(home) = dirs::home_dir() {
        paths.extend([
            home.join(".atmos").join("bin"),
            home.join(".local").join("bin"),
            home.join(".npm-global").join("bin"),
            home.join(".bun").join("bin"),
            home.join(".cargo").join("bin"),
            home.join(".deno").join("bin"),
            home.join(".yarn").join("bin"),
            home.join(".local").join("share").join("pnpm"),
            home.join("Library").join("pnpm"),
            home.join(".grok").join("bin"),
            home.join(".codeium").join("windsurf").join("bin"),
            home.join(".antigravity").join("antigravity").join("bin"),
        ]);
    }
    paths
}

fn resolve_login_shell_path() -> Option<String> {
    let shell = env::var("SHELL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            for candidate in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
                if Path::new(candidate).exists() {
                    return Some(candidate.to_string());
                }
            }
            None
        })?;

    let output = Command::new(&shell)
        .args(["-l", "-c", "echo $PATH"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut deduped = Vec::with_capacity(paths.len());
    for path in paths {
        if path.as_os_str().is_empty() {
            continue;
        }
        if !deduped.iter().any(|existing| existing == &path) {
            deduped.push(path);
        }
    }
    deduped
}

fn expand_home(value: &str) -> Option<PathBuf> {
    if value == "~" {
        return dirs::home_dir();
    }
    if let Some(rest) = value.strip_prefix("~/") {
        return dirs::home_dir().map(|home| home.join(rest));
    }
    Some(PathBuf::from(value))
}

fn is_executable(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata()
            .map(|m| m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_user_cli_path_includes_homebrew_on_unix() {
        let path = build_user_cli_path().expect("join path");
        let path_str = path.to_string_lossy();
        // At least one common user bin should be present after merge.
        assert!(
            path_str.contains("homebrew")
                || path_str.contains("/usr/local/bin")
                || path_str.contains("/usr/bin"),
            "unexpected PATH: {path_str}"
        );
    }

    #[test]
    fn resolve_binary_finds_system_sh() {
        // /bin/sh exists on every Unix CI host we care about.
        #[cfg(unix)]
        {
            let resolved = resolve_binary("sh");
            assert!(resolved.is_some(), "expected to resolve sh");
            assert!(resolved.unwrap().is_file());
        }
    }

    #[test]
    fn resolve_binary_rejects_empty() {
        assert!(resolve_binary("").is_none());
        assert!(resolve_binary("   ").is_none());
    }
}
