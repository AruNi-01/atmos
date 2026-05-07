mod ampcode;
mod claude_code;
mod codex;
mod cursor;
mod factory_droid;
mod gemini;
mod kiro;
mod opencode;

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tracing::info;

use crate::error::{EngineError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentHookInstallReport {
    pub claude_code: AgentHookToolStatus,
    pub codex: AgentHookToolStatus,
    pub cursor: AgentHookToolStatus,
    pub gemini: AgentHookToolStatus,
    pub factory_droid: AgentHookToolStatus,
    pub kiro: AgentHookToolStatus,
    pub opencode: AgentHookToolStatus,
    pub ampcode: AgentHookToolStatus,
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

pub fn install_all_hooks(port: u16) -> AgentHookInstallReport {
    info!("Installing agent hooks for Atmos port {}", port);

    let claude = claude_code::install(port);
    let codex = codex::install(port);
    let cursor = cursor::install(port);
    let gemini_status = gemini::install(port);
    let factory = factory_droid::install(port);
    let kiro_status = kiro::install(port);
    let opencode = opencode::install(port);
    let ampcode = ampcode::install(port);

    info!(
        "Agent hook install complete: claude_code={}, codex={}, cursor={}, gemini={}, factory_droid={}, kiro={}, opencode={}, ampcode={}",
        if claude.installed { "ok" } else { "skip" },
        if codex.installed { "ok" } else { "skip" },
        if cursor.installed { "ok" } else { "skip" },
        if gemini_status.installed { "ok" } else { "skip" },
        if factory.installed { "ok" } else { "skip" },
        if kiro_status.installed { "ok" } else { "skip" },
        if opencode.installed { "ok" } else { "skip" },
        if ampcode.installed { "ok" } else { "skip" },
    );

    AgentHookInstallReport {
        claude_code: claude,
        codex,
        cursor,
        gemini: gemini_status,
        factory_droid: factory,
        kiro: kiro_status,
        opencode,
        ampcode,
    }
}

pub fn uninstall_all_hooks() -> AgentHookInstallReport {
    info!("Uninstalling agent hooks");

    let claude = claude_code::uninstall();
    let codex = codex::uninstall();
    let cursor = cursor::uninstall();
    let gemini_status = gemini::uninstall();
    let factory = factory_droid::uninstall();
    let kiro_status = kiro::uninstall();
    let opencode = opencode::uninstall();
    let ampcode = ampcode::uninstall();

    AgentHookInstallReport {
        claude_code: claude,
        codex,
        cursor,
        gemini: gemini_status,
        factory_droid: factory,
        kiro: kiro_status,
        opencode,
        ampcode,
    }
}

pub fn check_all_hooks() -> AgentHookInstallReport {
    let claude = claude_code::check();
    let codex = codex::check();
    let cursor = cursor::check();
    let gemini_status = gemini::check();
    let factory = factory_droid::check();
    let kiro_status = kiro::check();
    let opencode = opencode::check();
    let ampcode = ampcode::check();

    AgentHookInstallReport {
        claude_code: claude,
        codex,
        cursor,
        gemini: gemini_status,
        factory_droid: factory,
        kiro: kiro_status,
        opencode,
        ampcode,
    }
}

fn home_dir() -> Result<PathBuf> {
    dirs::home_dir()
        .ok_or_else(|| EngineError::Processing("Cannot determine home directory".into()))
}

/// Install hook for a single tool. Returns `None` if `tool` is not a known tool name.
pub fn install_hook(tool: &str, port: u16) -> Option<AgentHookToolStatus> {
    Some(match tool {
        "claude_code" => claude_code::install(port),
        "codex" => codex::install(port),
        "cursor" => cursor::install(port),
        "gemini" => gemini::install(port),
        "factory_droid" => factory_droid::install(port),
        "kiro" => kiro::install(port),
        "opencode" => opencode::install(port),
        "ampcode" => ampcode::install(port),
        _ => return None,
    })
}

/// Uninstall hook for a single tool. Returns `None` if `tool` is not a known tool name.
pub fn uninstall_hook(tool: &str) -> Option<AgentHookToolStatus> {
    Some(match tool {
        "claude_code" => claude_code::uninstall(),
        "codex" => codex::uninstall(),
        "cursor" => cursor::uninstall(),
        "gemini" => gemini::uninstall(),
        "factory_droid" => factory_droid::uninstall(),
        "kiro" => kiro::uninstall(),
        "opencode" => opencode::uninstall(),
        "ampcode" => ampcode::uninstall(),
        _ => return None,
    })
}
