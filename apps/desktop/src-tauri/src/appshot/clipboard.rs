use std::io::Write;
use std::process::{Command, Stdio};

pub fn copy_text(text: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut child = Command::new("pbcopy")
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|error| format!("failed to start pbcopy: {error}"))?;
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "failed to open pbcopy stdin".to_string())?;
        stdin
            .write_all(text.as_bytes())
            .map_err(|error| format!("failed to write clipboard text: {error}"))?;
        let status = child
            .wait()
            .map_err(|error| format!("failed to wait for pbcopy: {error}"))?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("pbcopy exited with status {status}"));
    }

    #[cfg(target_os = "windows")]
    {
        let escaped = text.replace('\'', "''");
        let status = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!("Set-Clipboard -Value '{escaped}'"),
            ])
            .status()
            .map_err(|error| format!("failed to start powershell clipboard: {error}"))?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("Set-Clipboard exited with status {status}"));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let helpers = ["wl-copy", "xclip"];
        for helper in helpers {
            if let Ok(mut child) = Command::new(helper).stdin(Stdio::piped()).spawn() {
                if let Some(stdin) = child.stdin.as_mut() {
                    if stdin.write_all(text.as_bytes()).is_ok() {
                        if let Ok(status) = child.wait() {
                            if status.success() {
                                return Ok(());
                            }
                        }
                    }
                }
            }
        }
        Err("no supported clipboard helper found".to_string())
    }
}
