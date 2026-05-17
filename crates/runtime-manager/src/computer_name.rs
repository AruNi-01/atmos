//! Friendly local computer name for UI and relay registration.

/// User-visible device name (macOS: `scutil --get ComputerName`).
pub fn local_computer_display_name() -> String {
    local_computer_display_name_opt().unwrap_or_else(|| "My Computer".to_string())
}

pub fn local_computer_display_name_opt() -> Option<String> {
    #[cfg(target_os = "macos")]
    if let Some(name) = command_stdout("scutil", &["--get", "ComputerName"]) {
        return Some(name);
    }

    if let Ok(name) = std::env::var("COMPUTERNAME") {
        let trimmed = name.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Ok(name) = std::env::var("HOSTNAME") {
        let trimmed = name.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    command_stdout("hostname", &[])
}

fn command_stdout(program: &str, args: &[&str]) -> Option<String> {
    let output = std::process::Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8(output.stdout).ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::local_computer_display_name;

    #[test]
    fn local_computer_display_name_is_non_empty() {
        assert!(!local_computer_display_name().trim().is_empty());
    }
}
