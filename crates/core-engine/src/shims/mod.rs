//! Shell Shim Manager - Dynamic terminal title injection
//!
//! Manages OSC-based shim scripts that are injected into shell sessions
//! to enable dynamic terminal tab titles (like iTerm2).
//!
//! # How It Works
//! 1. Shim scripts are embedded in the binary at compile time
//! 2. At runtime, they are written to `~/.atmos/shims/`
//! 3. When creating a tmux window or simple PTY session, the shell is
//!    started with arguments that load the appropriate shim
//! 4. The shim installs preexec/precmd hooks that emit OSC 9999 sequences
//! 5. xterm.js on the frontend intercepts these sequences and updates tab titles
//!
//! # Supported Shells
//! - **Bash**: `--init-file` to load shim (which also sources user's .bashrc)
//! - **Zsh**: `ZDOTDIR` trick to intercept startup (sources user's .zshrc/.zshenv)
//! - **Fish**: `--init-command` to source shim (runs before config.fish)

use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tracing::{debug, info, warn};

use crate::error::{EngineError, Result};

// Embed shim scripts at compile time
const BASH_SHIM: &str = include_str!("bash_shim.sh");
const ZSH_SHIM_ZSHENV: &str = include_str!("zsh_shim_zshenv");
const ZSH_SHIM_ZSHRC: &str = include_str!("zsh_shim_zshrc");
const FISH_SHIM: &str = include_str!("fish_shim.fish");

/// Cached shims directory path (initialized once)
static SHIMS_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Get the shims directory path (~/.atmos/shims/)
fn shims_dir() -> PathBuf {
    dirs::home_dir()
        .map(|h| h.join(".atmos").join("shims"))
        .unwrap_or_else(|| PathBuf::from("/tmp/.atmos/shims"))
}

/// Ensure all shim scripts are installed on disk.
///
/// This is idempotent — scripts are overwritten each time to ensure
/// they match the current binary version. Called once at startup.
pub fn ensure_installed() -> Result<PathBuf> {
    let dir = SHIMS_DIR.get_or_init(shims_dir).clone();

    // Create directories
    let zdotdir = dir.join("zdotdir");
    std::fs::create_dir_all(&zdotdir).map_err(|e| {
        EngineError::Tmux(format!(
            "Failed to create shims directory {:?}: {}",
            zdotdir, e
        ))
    })?;

    // Write bash shim
    let bash_path = dir.join("atmos_shim.bash");
    std::fs::write(&bash_path, BASH_SHIM)
        .map_err(|e| EngineError::Tmux(format!("Failed to write bash shim: {}", e)))?;

    // Write zsh shims (ZDOTDIR approach)
    let zshenv_path = zdotdir.join(".zshenv");
    std::fs::write(&zshenv_path, ZSH_SHIM_ZSHENV)
        .map_err(|e| EngineError::Tmux(format!("Failed to write zsh .zshenv shim: {}", e)))?;
    let zshrc_path = zdotdir.join(".zshrc");
    std::fs::write(&zshrc_path, ZSH_SHIM_ZSHRC)
        .map_err(|e| EngineError::Tmux(format!("Failed to write zsh .zshrc shim: {}", e)))?;

    // Write fish shim
    let fish_path = dir.join("atmos_shim.fish");
    std::fs::write(&fish_path, FISH_SHIM)
        .map_err(|e| EngineError::Tmux(format!("Failed to write fish shim: {}", e)))?;

    info!("Shell shims installed at {:?}", dir);
    Ok(dir)
}

/// Detect the user's default shell from environment or explicit parameter.
///
/// Returns the shell binary name (e.g., "zsh", "bash", "fish").
pub fn detect_shell(explicit_shell: Option<&str>) -> String {
    let shell_path = explicit_shell
        .map(String::from)
        .or_else(|| std::env::var("SHELL").ok())
        .unwrap_or_else(|| "/bin/sh".to_string());

    Path::new(&shell_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("sh")
        .to_string()
}

/// Build shell command arguments for tmux `new-window` with shim injection.
///
/// Returns `None` for unsupported shells (graceful degradation — the window
/// will start normally without dynamic title support).
///
/// # Returns
/// A vector of strings to append to the `tmux new-window` command.
/// For example: `["env", "ZDOTDIR=/path/to/zdotdir", "zsh"]`
pub fn build_shell_command(shims_dir: &Path, shell: Option<&str>) -> Option<Vec<String>> {
    let shell_name = detect_shell(shell);
    let shell_path = shell
        .map(String::from)
        .or_else(|| std::env::var("SHELL").ok())
        .unwrap_or_else(|| format!("/bin/{}", shell_name));

    match shell_name.as_str() {
        "bash" => {
            let shim_path = shims_dir.join("atmos_shim.bash");
            if !shim_path.exists() {
                warn!("Bash shim not found at {:?}, skipping injection", shim_path);
                return None;
            }
            debug!("Injecting bash shim: --init-file {:?}", shim_path);
            Some(vec![
                shell_path,
                "--init-file".to_string(),
                shim_path.to_string_lossy().to_string(),
            ])
        }
        "zsh" => {
            let zdotdir = shims_dir.join("zdotdir");
            if !zdotdir.join(".zshrc").exists() {
                warn!("Zsh shim not found at {:?}, skipping injection", zdotdir);
                return None;
            }
            debug!("Injecting zsh shim: ZDOTDIR={:?}", zdotdir);
            Some(vec![
                "env".to_string(),
                format!("ZDOTDIR={}", zdotdir.to_string_lossy()),
                shell_path,
            ])
        }
        "fish" => {
            let shim_path = shims_dir.join("atmos_shim.fish");
            if !shim_path.exists() {
                warn!("Fish shim not found at {:?}, skipping injection", shim_path);
                return None;
            }
            debug!("Injecting fish shim: --init-command source {:?}", shim_path);
            Some(vec![
                shell_path,
                "--init-command".to_string(),
                format!("source {}", shim_path.to_string_lossy()),
            ])
        }
        _ => {
            debug!(
                "Unsupported shell '{}' for shim injection, starting without dynamic titles",
                shell_name
            );
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_shell() {
        assert_eq!(detect_shell(Some("/bin/zsh")), "zsh");
        assert_eq!(detect_shell(Some("/usr/local/bin/bash")), "bash");
        assert_eq!(detect_shell(Some("/usr/bin/fish")), "fish");
        assert_eq!(detect_shell(Some("zsh")), "zsh");
    }

    #[test]
    fn test_build_shell_command_unsupported() {
        let dir = PathBuf::from("/tmp/test_shims");
        assert!(build_shell_command(&dir, Some("/bin/ksh")).is_none());
        assert!(build_shell_command(&dir, Some("/bin/tcsh")).is_none());
    }

    #[test]
    fn test_ensure_installed() {
        // This test writes to ~/.atmos/shims/ — only run manually
        let result = ensure_installed();
        assert!(result.is_ok());
        let dir = result.unwrap();
        assert!(dir.join("atmos_shim.bash").exists());
        assert!(dir.join("zdotdir/.zshrc").exists());
        assert!(dir.join("zdotdir/.zshenv").exists());
        assert!(dir.join("atmos_shim.fish").exists());
    }
}
