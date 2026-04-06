mod claude_code;
mod codex;
mod opencode;

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tracing::info;

use crate::error::{EngineError, Result};

fn atmos_port() -> u16 {
    std::env::var("ATMOS_PORT")
        .ok()
        .or_else(|| std::env::var("SERVER_PORT").ok())
        .and_then(|p| p.parse().ok())
        .unwrap_or(30303)
}

/// Install hooks using the explicitly provided port (preferred over env-var fallback).
pub fn install_all_hooks_with_port(port: u16) -> AgentHookInstallReport {
    info!("Installing agent hooks for Atmos port {}", port);
    let claude = claude_code::install(port);
    let codex = codex::install(port);
    let opencode = opencode::install(port);
    info!(
        "Agent hook install complete: claude_code={}, codex={}, opencode={}",
        if claude.installed { "ok" } else { "skip" },
        if codex.installed { "ok" } else { "skip" },
        if opencode.installed { "ok" } else { "skip" },
    );
    AgentHookInstallReport { claude_code: claude, codex, opencode }
}

/// Uninstall hooks using the explicitly provided port.
pub fn uninstall_all_hooks_with_port(port: u16) -> AgentHookInstallReport {
    info!("Uninstalling agent hooks for Atmos port {}", port);
    let claude = claude_code::uninstall(port);
    let codex = codex::uninstall(port);
    let opencode = opencode::uninstall();
    AgentHookInstallReport { claude_code: claude, codex, opencode }
}

/// Check hook status using the explicitly provided port.
pub fn check_all_hooks_with_port(port: u16) -> AgentHookInstallReport {
    let claude = claude_code::check(port);
    let codex = codex::check(port);
    let opencode = opencode::check();
    AgentHookInstallReport { claude_code: claude, codex, opencode }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentHookInstallReport {
    pub claude_code: AgentHookToolStatus,
    pub codex: AgentHookToolStatus,
    pub opencode: AgentHookToolStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentHookToolStatus {
    pub detected: bool,
    pub installed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl AgentHookToolStatus {
    fn not_detected() -> Self {
        Self {
            detected: false,
            installed: false,
            config_path: None,
            error: None,
        }
    }

    fn success(config_path: impl Into<String>) -> Self {
        Self {
            detected: true,
            installed: true,
            config_path: Some(config_path.into()),
            error: None,
        }
    }

    fn failed(config_path: impl Into<String>, error: impl Into<String>) -> Self {
        Self {
            detected: true,
            installed: false,
            config_path: Some(config_path.into()),
            error: Some(error.into()),
        }
    }
}

pub fn install_all_hooks() -> AgentHookInstallReport {
    let port = atmos_port();
    info!("Installing agent hooks for Atmos port {}", port);

    let claude = claude_code::install(port);
    let codex = codex::install(port);
    let opencode = opencode::install(port);

    info!(
        "Agent hook install complete: claude_code={}, codex={}, opencode={}",
        if claude.installed { "ok" } else { "skip" },
        if codex.installed { "ok" } else { "skip" },
        if opencode.installed { "ok" } else { "skip" },
    );

    AgentHookInstallReport {
        claude_code: claude,
        codex,
        opencode,
    }
}

pub fn uninstall_all_hooks() -> AgentHookInstallReport {
    let port = atmos_port();
    info!("Uninstalling agent hooks for Atmos port {}", port);

    let claude = claude_code::uninstall(port);
    let codex = codex::uninstall(port);
    let opencode = opencode::uninstall();

    AgentHookInstallReport {
        claude_code: claude,
        codex,
        opencode,
    }
}

pub fn check_all_hooks() -> AgentHookInstallReport {
    let port = atmos_port();

    let claude = claude_code::check(port);
    let codex = codex::check(port);
    let opencode = opencode::check();

    AgentHookInstallReport {
        claude_code: claude,
        codex,
        opencode,
    }
}

fn home_dir() -> Result<PathBuf> {
    dirs::home_dir()
        .ok_or_else(|| EngineError::Processing("Cannot determine home directory".into()))
}
