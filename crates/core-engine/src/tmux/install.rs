use std::collections::HashSet;
use std::process::Command;

use crate::error::{EngineError, Result};

use super::{TmuxEngine, TmuxInstallPlan, TmuxVersion};

#[derive(Debug, Clone, Copy)]
struct InstallMethod {
    binary: &'static str,
    label: &'static str,
    command: &'static str,
    requires_sudo: bool,
}

const MACOS_INSTALL_METHODS: &[InstallMethod] = &[InstallMethod {
    binary: "brew",
    label: "Homebrew",
    command: "brew install tmux",
    requires_sudo: false,
}];

const LINUX_INSTALL_METHODS: &[InstallMethod] = &[
    InstallMethod {
        binary: "apt-get",
        label: "apt-get",
        command: "sudo apt-get update && sudo apt-get install -y tmux",
        requires_sudo: true,
    },
    InstallMethod {
        binary: "dnf",
        label: "dnf",
        command: "sudo dnf install -y tmux",
        requires_sudo: true,
    },
    InstallMethod {
        binary: "yum",
        label: "yum",
        command: "sudo yum install -y tmux",
        requires_sudo: true,
    },
    InstallMethod {
        binary: "pacman",
        label: "pacman",
        command: "sudo pacman -S --noconfirm tmux",
        requires_sudo: true,
    },
    InstallMethod {
        binary: "zypper",
        label: "zypper",
        command: "sudo zypper install -y tmux",
        requires_sudo: true,
    },
    InstallMethod {
        binary: "apk",
        label: "apk",
        command: "sudo apk add tmux",
        requires_sudo: true,
    },
];

fn platform_label(os: &str) -> String {
    match os {
        "macos" => "macOS",
        "linux" => "Linux",
        "windows" => "Windows",
        other => other,
    }
    .to_string()
}

fn methods_for_os(os: &str) -> &'static [InstallMethod] {
    match os {
        "macos" => MACOS_INSTALL_METHODS,
        "linux" => LINUX_INSTALL_METHODS,
        _ => &[],
    }
}

fn command_exists(binary: &str) -> bool {
    Command::new(binary).arg("--version").output().is_ok()
}

fn build_install_plan(
    os: &str,
    installed: bool,
    available_commands: &HashSet<&'static str>,
) -> TmuxInstallPlan {
    let platform = platform_label(os);

    if installed {
        return TmuxInstallPlan {
            installed: true,
            supported: false,
            platform,
            package_manager: None,
            package_manager_label: None,
            command: None,
            requires_sudo: false,
            reason: Some("tmux is already installed.".to_string()),
        };
    }

    if let Some(method) = methods_for_os(os)
        .iter()
        .find(|method| available_commands.contains(method.binary))
    {
        return TmuxInstallPlan {
            installed: false,
            supported: true,
            platform,
            package_manager: Some(method.binary.to_string()),
            package_manager_label: Some(method.label.to_string()),
            command: Some(method.command.to_string()),
            requires_sudo: method.requires_sudo,
            reason: None,
        };
    }

    let reason = match os {
        "macos" => {
            Some("Homebrew was not found on the API host. Install Homebrew first or install tmux manually.".to_string())
        }
        "linux" => Some(
            "No supported package manager was detected on the API host. Install tmux manually in a terminal on that machine."
                .to_string(),
        ),
        "windows" => Some(
            "Atmos can only use tmux when the API runs inside a Unix-like environment. Run the API inside WSL or install tmux on the backend host manually."
                .to_string(),
        ),
        _ => Some("Automatic tmux installation is not supported on this platform yet.".to_string()),
    };

    TmuxInstallPlan {
        installed: false,
        supported: false,
        platform,
        package_manager: None,
        package_manager_label: None,
        command: None,
        requires_sudo: false,
        reason,
    }
}

pub(crate) fn detect_install_plan(installed: bool) -> TmuxInstallPlan {
    let os = std::env::consts::OS;
    let available_commands = methods_for_os(os)
        .iter()
        .filter_map(|method| command_exists(method.binary).then_some(method.binary))
        .collect::<HashSet<_>>();

    build_install_plan(os, installed, &available_commands)
}

impl TmuxEngine {
    /// Check if tmux is installed on the system
    pub fn check_installed() -> bool {
        Command::new("tmux")
            .arg("-V")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Detect the best available tmux installation plan for the current host.
    pub fn detect_install_plan() -> TmuxInstallPlan {
        detect_install_plan(Self::check_installed())
    }

    /// Get tmux version information
    pub fn get_version() -> Result<TmuxVersion> {
        let output = Command::new("tmux")
            .arg("-V")
            .output()
            .map_err(|e| EngineError::Tmux(format!("Failed to get tmux version: {}", e)))?;

        if !output.status.success() {
            return Err(EngineError::Tmux("tmux -V failed".to_string()));
        }

        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let version_str = raw
            .strip_prefix("tmux ")
            .unwrap_or(&raw)
            .chars()
            .take_while(|c| c.is_ascii_digit() || *c == '.')
            .collect::<String>();

        let parts: Vec<&str> = version_str.split('.').collect();
        let major = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
        let minor = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);

        Ok(TmuxVersion { major, minor, raw })
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::build_install_plan;

    #[test]
    fn test_install_plan_prefers_homebrew_on_macos() {
        let available = HashSet::from(["brew"]);
        let plan = build_install_plan("macos", false, &available);

        assert!(plan.supported);
        assert_eq!(plan.platform, "macOS");
        assert_eq!(plan.package_manager.as_deref(), Some("brew"));
        assert_eq!(plan.command.as_deref(), Some("brew install tmux"));
        assert!(!plan.requires_sudo);
    }

    #[test]
    fn test_install_plan_prefers_apt_get_on_linux() {
        let available = HashSet::from(["apt-get", "dnf"]);
        let plan = build_install_plan("linux", false, &available);

        assert!(plan.supported);
        assert_eq!(plan.platform, "Linux");
        assert_eq!(plan.package_manager.as_deref(), Some("apt-get"));
        assert_eq!(
            plan.command.as_deref(),
            Some("sudo apt-get update && sudo apt-get install -y tmux")
        );
        assert!(plan.requires_sudo);
    }

    #[test]
    fn test_install_plan_reports_unsupported_without_package_manager() {
        let available = HashSet::new();
        let plan = build_install_plan("linux", false, &available);

        assert!(!plan.supported);
        assert!(plan.command.is_none());
        assert!(plan.reason.is_some());
    }

    #[test]
    fn test_install_plan_reports_already_installed() {
        let available = HashSet::from(["brew"]);
        let plan = build_install_plan("macos", true, &available);

        assert!(plan.installed);
        assert!(!plan.supported);
        assert!(plan.command.is_none());
    }
}
