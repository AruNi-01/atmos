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
const GROK_WRAPPER: &str = include_str!("grok_wrapper.sh");

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
    install_into(&dir)?;
    info!("Shell shims installed at {:?}", dir);
    Ok(dir)
}

fn install_into(dir: &Path) -> Result<()> {
    let zdotdir = dir.join("zdotdir");
    let bin_dir = dir.join("bin");
    std::fs::create_dir_all(&zdotdir).map_err(|e| {
        EngineError::Tmux(format!(
            "Failed to create shims directory {:?}: {}",
            zdotdir, e
        ))
    })?;
    std::fs::create_dir_all(&bin_dir).map_err(|e| {
        EngineError::Tmux(format!(
            "Failed to create shim bin directory {:?}: {}",
            bin_dir, e
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

    // Keep Grok's tmux detection scoped to the real child process. The wrapper
    // is first on PATH only inside Atmos-managed shells.
    let grok_path = bin_dir.join("grok");
    std::fs::write(&grok_path, GROK_WRAPPER)
        .map_err(|e| EngineError::Tmux(format!("Failed to write Grok shim: {}", e)))?;
    set_executable(&grok_path)?;

    Ok(())
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;

    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
        .map_err(|e| EngineError::Tmux(format!("Failed to chmod shim {:?}: {}", path, e)))
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<()> {
    Ok(())
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
    let shims_bin_env = format!(
        "ATMOS_SHIMS_BIN={}",
        shims_dir.join("bin").to_string_lossy()
    );

    match shell_name.as_str() {
        "bash" => {
            let shim_path = shims_dir.join("atmos_shim.bash");
            if !shim_path.exists() {
                warn!("Bash shim not found at {:?}, skipping injection", shim_path);
                return None;
            }
            debug!("Injecting bash shim: --init-file {:?}", shim_path);
            Some(vec![
                "env".to_string(),
                shims_bin_env,
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
                shims_bin_env,
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
                "env".to_string(),
                shims_bin_env,
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
    fn test_install_into_writes_managed_shims() {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path();
        install_into(dir).unwrap();

        assert!(dir.join("atmos_shim.bash").exists());
        assert!(dir.join("zdotdir/.zshrc").exists());
        assert!(dir.join("zdotdir/.zshenv").exists());
        assert!(dir.join("atmos_shim.fish").exists());
        assert!(dir.join("bin/grok").exists());
    }

    #[test]
    fn test_supported_shells_receive_shim_bin_env() {
        let temp = tempfile::tempdir().unwrap();
        install_into(temp.path()).unwrap();
        let expected = format!(
            "ATMOS_SHIMS_BIN={}",
            temp.path().join("bin").to_string_lossy()
        );

        for shell in ["/bin/bash", "/bin/zsh", "/usr/bin/fish"] {
            let command = build_shell_command(temp.path(), Some(shell)).unwrap();
            assert_eq!(command[0], "env");
            assert!(command.contains(&expected), "{shell}: {command:?}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn test_grok_wrapper_executes_real_binary_without_tmux_identity() {
        use std::os::unix::fs::PermissionsExt;
        use std::process::Command;

        let temp = tempfile::tempdir().unwrap();
        let shims_dir = temp.path().join("shims");
        install_into(&shims_dir).unwrap();

        let real_bin = temp.path().join("real-bin");
        std::fs::create_dir_all(&real_bin).unwrap();
        let real_grok = real_bin.join("grok");
        std::fs::write(
            &real_grok,
            r#"#!/bin/sh
printf '%s\n' "${TMUX-unset}" "${TMUX_PANE-unset}" "$#" "$1" "$2"
"#,
        )
        .unwrap();
        std::fs::set_permissions(&real_grok, std::fs::Permissions::from_mode(0o755)).unwrap();

        let shim_bin = shims_dir.join("bin");
        let path =
            std::env::join_paths([shim_bin.as_path(), shim_bin.as_path(), real_bin.as_path()])
                .unwrap();
        let output = Command::new(shim_bin.join("grok"))
            .args(["alpha", "two words"])
            .env("ATMOS_SHIMS_BIN", &shim_bin)
            .env("ATMOS_GROK_REAL_PATH", &real_bin)
            .env("PATH", path)
            .env("TMUX", "/tmp/tmux,1,0")
            .env("TMUX_PANE", "%1")
            .output()
            .unwrap();

        assert!(output.status.success(), "{output:?}");
        let lines = String::from_utf8(output.stdout).unwrap();
        assert_eq!(
            lines.lines().collect::<Vec<_>>(),
            ["unset", "unset", "2", "alpha", "two words"]
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_bash_grok_function_survives_path_and_hook_replacement() {
        use std::os::unix::fs::PermissionsExt;
        use std::process::Command;

        let temp = tempfile::tempdir().unwrap();
        let shims_dir = temp.path().join("shims");
        install_into(&shims_dir).unwrap();

        let real_bin = temp.path().join("real-bin");
        std::fs::create_dir_all(&real_bin).unwrap();
        let real_grok = real_bin.join("grok");
        std::fs::write(
            &real_grok,
            r#"#!/bin/sh
printf '%s\n' "${TMUX-unset}" "${TMUX_PANE-unset}" "$#" "$1"
"#,
        )
        .unwrap();
        std::fs::set_permissions(&real_grok, std::fs::Permissions::from_mode(0o755)).unwrap();

        let script = format!(
            r#"source "{}"
PATH="{}:/usr/bin:/bin"
trap - DEBUG
PROMPT_COMMAND=
hash -r
grok manual
"#,
            shims_dir.join("atmos_shim.bash").display(),
            real_bin.display()
        );
        let output = Command::new("/bin/bash")
            .args(["--noprofile", "--norc", "-c", &script])
            .env("HOME", temp.path())
            .env("ATMOS_SHIMS_BIN", shims_dir.join("bin"))
            .env("PATH", "/usr/bin:/bin")
            .env("TMUX", "/tmp/tmux,1,0")
            .env("TMUX_PANE", "%1")
            .output()
            .unwrap();

        assert!(output.status.success(), "{output:?}");
        let stdout = String::from_utf8(output.stdout).unwrap();
        assert!(
            stdout.contains("unset\nunset\n1\nmanual\n"),
            "unexpected stdout: {stdout:?}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_zsh_grok_function_survives_path_and_hook_replacement() {
        use std::os::unix::fs::PermissionsExt;
        use std::process::Command;

        if !Path::new("/bin/zsh").exists() {
            return;
        }

        let temp = tempfile::tempdir().unwrap();
        let shims_dir = temp.path().join("shims");
        install_into(&shims_dir).unwrap();
        std::fs::write(temp.path().join(".zshrc"), "setopt ERR_EXIT\n").unwrap();

        let real_bin = temp.path().join("real-bin");
        std::fs::create_dir_all(&real_bin).unwrap();
        let real_grok = real_bin.join("grok");
        std::fs::write(
            &real_grok,
            r#"#!/bin/sh
printf '%s\n' "${TMUX-unset}" "${TMUX_PANE-unset}" "$#" "$1"
"#,
        )
        .unwrap();
        std::fs::set_permissions(&real_grok, std::fs::Permissions::from_mode(0o755)).unwrap();

        let script = format!(
            r#"source "{}"
PATH="{}:/usr/bin:/bin"
precmd_functions=()
preexec_functions=()
rehash
grok manual
"#,
            shims_dir.join("zdotdir/.zshrc").display(),
            real_bin.display()
        );
        let output = Command::new("/bin/zsh")
            .args(["-f", "-c", &script])
            .env("HOME", temp.path())
            .env("ATMOS_SHIMS_BIN", shims_dir.join("bin"))
            .env("PATH", "/usr/bin:/bin")
            .env("TMUX", "/tmp/tmux,1,0")
            .env("TMUX_PANE", "%1")
            .output()
            .unwrap();

        assert!(output.status.success(), "{output:?}");
        let stdout = String::from_utf8(output.stdout).unwrap();
        assert!(
            stdout.contains("unset\nunset\n1\nmanual\n"),
            "unexpected stdout: {stdout:?}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_zsh_startup_reaches_managed_zshrc_when_user_has_zshenv() {
        use std::os::unix::fs::PermissionsExt;
        use std::process::Command;

        if !Path::new("/bin/zsh").exists() {
            return;
        }

        let temp = tempfile::tempdir().unwrap();
        let shims_dir = temp.path().join("shims");
        install_into(&shims_dir).unwrap();

        let real_bin = temp.path().join("real-bin");
        std::fs::create_dir_all(&real_bin).unwrap();
        let real_grok = real_bin.join("grok");
        std::fs::write(
            &real_grok,
            r#"#!/bin/sh
printf '%s\n' "${TMUX-unset}" "${TMUX_PANE-unset}" "$#" "$1"
"#,
        )
        .unwrap();
        std::fs::set_permissions(&real_grok, std::fs::Permissions::from_mode(0o755)).unwrap();

        std::fs::write(
            temp.path().join(".zshenv"),
            "export ATMOS_TEST_USER_ZSHENV=loaded\n",
        )
        .unwrap();
        std::fs::write(
            temp.path().join(".zshrc"),
            format!("export PATH=\"{}:/usr/bin:/bin\"\n", real_bin.display()),
        )
        .unwrap();

        let output = Command::new("/bin/zsh")
            .args([
                "-i",
                "-c",
                r#"print -r -- "$ATMOS_TEST_USER_ZSHENV" "$(( $+functions[grok] ))"
grok manual
"#,
            ])
            .env("HOME", temp.path())
            .env("ZDOTDIR", shims_dir.join("zdotdir"))
            .env("ATMOS_SHIMS_BIN", shims_dir.join("bin"))
            .env("PATH", "/usr/bin:/bin")
            .env("TMUX", "/tmp/tmux,1,0")
            .env("TMUX_PANE", "%1")
            .output()
            .unwrap();

        assert!(output.status.success(), "{output:?}");
        assert_eq!(
            String::from_utf8(output.stdout).unwrap(),
            "loaded 1\nunset\nunset\n1\nmanual\n"
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_zsh_startup_survives_shell_replacement_from_user_zshrc() {
        use std::os::unix::fs::PermissionsExt;
        use std::process::Command;

        if !Path::new("/bin/zsh").exists() {
            return;
        }

        let temp = tempfile::tempdir().unwrap();
        let shims_dir = temp.path().join("shims");
        install_into(&shims_dir).unwrap();

        let real_bin = temp.path().join("real-bin");
        std::fs::create_dir_all(&real_bin).unwrap();
        let real_grok = real_bin.join("grok");
        std::fs::write(
            &real_grok,
            r#"#!/bin/sh
printf '%s\n' "${TMUX-unset}" "${TMUX_PANE-unset}" "$#" "$1"
"#,
        )
        .unwrap();
        std::fs::set_permissions(&real_grok, std::fs::Permissions::from_mode(0o755)).unwrap();

        std::fs::write(
            temp.path().join(".zshrc"),
            format!(
                r#"export PATH="{}:/usr/bin:/bin"
if [[ -z "${{ATMOS_TEST_REPLACED:-}}" ]]; then
    export ATMOS_TEST_REPLACED=1
    exec /bin/zsh -i -c 'print -r -- "$(( $+functions[grok] ))"; grok replacement'
fi
"#,
                real_bin.display()
            ),
        )
        .unwrap();

        let output = Command::new("/bin/zsh")
            .args(["-i", "-c", "exit 97"])
            .env("HOME", temp.path())
            .env("ZDOTDIR", shims_dir.join("zdotdir"))
            .env("ATMOS_SHIMS_BIN", shims_dir.join("bin"))
            .env("PATH", "/usr/bin:/bin")
            .env("TMUX", "/tmp/tmux,1,0")
            .env("TMUX_PANE", "%1")
            .output()
            .unwrap();

        assert!(output.status.success(), "{output:?}");
        assert_eq!(
            String::from_utf8(output.stdout).unwrap(),
            "1\nunset\nunset\n1\nreplacement\n"
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_grok_wrapper_preserves_empty_path_component() {
        use std::os::unix::fs::PermissionsExt;
        use std::process::Command;

        let temp = tempfile::tempdir().unwrap();
        let shims_dir = temp.path().join("shims");
        install_into(&shims_dir).unwrap();

        let real_bin = temp.path().join("real-bin");
        std::fs::create_dir_all(&real_bin).unwrap();
        let real_grok = real_bin.join("grok");
        std::fs::write(&real_grok, "#!/bin/sh\nprintf '%s\\n' \"${TMUX-unset}\"\n").unwrap();
        std::fs::set_permissions(&real_grok, std::fs::Permissions::from_mode(0o755)).unwrap();

        let shim_bin = shims_dir.join("bin");
        let output = Command::new(shim_bin.join("grok"))
            .current_dir(&real_bin)
            .env("ATMOS_SHIMS_BIN", &shim_bin)
            .env("ATMOS_GROK_REAL_PATH", "")
            .env("PATH", &shim_bin)
            .env("TMUX", "/tmp/tmux,1,0")
            .env("TMUX_PANE", "%1")
            .output()
            .unwrap();

        assert!(output.status.success(), "{output:?}");
        assert_eq!(String::from_utf8(output.stdout).unwrap(), "unset\n");
    }
}
