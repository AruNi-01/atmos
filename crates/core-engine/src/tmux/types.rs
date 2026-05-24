use serde::{Deserialize, Serialize};

/// Information about a tmux session
#[derive(Debug, Clone, Serialize)]
pub struct TmuxSessionInfo {
    pub name: String,
    pub windows: u32,
    pub created: String,
    pub attached: bool,
}

/// Information about a tmux window
#[derive(Debug, Clone, Serialize)]
pub struct TmuxWindowInfo {
    pub index: u32,
    pub name: String,
    pub active: bool,
    pub panes: u32,
}

/// Snapshot of a tmux pane for initial terminal hydration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmuxPaneSnapshot {
    pub data: String,
    pub cursor_x: u32,
    pub cursor_y: u32,
    pub cols: u32,
    pub rows: u32,
    pub alternate: bool,
}

/// One page of tmux scrollback for canvas `extract-text` pagination.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmuxPaneCapturePage {
    pub snapshot: TmuxPaneSnapshot,
    pub skip_from_bottom: i32,
    pub lines_returned: u32,
    pub has_more_older: bool,
    pub next_skip_from_bottom: Option<i32>,
}

/// Tmux version information
#[derive(Debug, Clone, Serialize)]
pub struct TmuxVersion {
    pub major: u32,
    pub minor: u32,
    pub raw: String,
}

impl TmuxVersion {
    /// Check if version is at least the specified major.minor
    pub fn at_least(&self, major: u32, minor: u32) -> bool {
        self.major > major || (self.major == major && self.minor >= minor)
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct TmuxInstallPlan {
    pub installed: bool,
    pub supported: bool,
    pub platform: String,
    pub package_manager: Option<String>,
    pub package_manager_label: Option<String>,
    pub command: Option<String>,
    pub requires_sudo: bool,
    pub reason: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::TmuxVersion;

    #[test]
    fn test_version_at_least() {
        let v = TmuxVersion {
            major: 3,
            minor: 4,
            raw: "tmux 3.4".to_string(),
        };
        assert!(v.at_least(3, 4));
        assert!(v.at_least(3, 3));
        assert!(v.at_least(2, 9));
        assert!(!v.at_least(3, 5));
        assert!(!v.at_least(4, 0));
    }
}
