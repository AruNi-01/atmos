mod ampcode;
mod antigravity;
mod claude_code;
mod codex;
mod cursor;
mod factory_droid;
mod gemini;
mod grok_build;
mod hermes;
mod kiro;
mod opencode;
mod pi;

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::info;

use crate::error::{EngineError, Result};

pub const CURRENT_HOOK_VERSION: u32 = 2;
const LEGACY_HOOK_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentHookInstallReport {
    pub claude_code: AgentHookToolStatus,
    pub codex: AgentHookToolStatus,
    pub cursor: AgentHookToolStatus,
    pub gemini: AgentHookToolStatus,
    pub antigravity: AgentHookToolStatus,
    pub factory_droid: AgentHookToolStatus,
    pub kiro: AgentHookToolStatus,
    pub opencode: AgentHookToolStatus,
    pub ampcode: AgentHookToolStatus,
    pub pi: AgentHookToolStatus,
    pub hermes: AgentHookToolStatus,
    pub grok_build: AgentHookToolStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentHookToolStatus {
    pub detected: bool,
    pub installed: bool,
    pub current_version: u32,
    pub outdated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed_version: Option<u32>,
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
            current_version: CURRENT_HOOK_VERSION,
            outdated: false,
            installed_version: None,
            config_path: None,
            error: None,
        }
    }

    fn success(config_path: impl Into<String>) -> Self {
        Self {
            detected: true,
            installed: true,
            current_version: CURRENT_HOOK_VERSION,
            outdated: false,
            installed_version: Some(CURRENT_HOOK_VERSION),
            config_path: Some(config_path.into()),
            error: None,
        }
    }

    fn detected_uninstalled(config_path: impl Into<String>) -> Self {
        Self {
            detected: true,
            installed: false,
            current_version: CURRENT_HOOK_VERSION,
            outdated: false,
            installed_version: None,
            config_path: Some(config_path.into()),
            error: None,
        }
    }

    fn detected_installed(config_path: impl Into<String>, installed_version: Option<u32>) -> Self {
        let installed_version = installed_version.or(Some(LEGACY_HOOK_VERSION));
        Self {
            detected: true,
            installed: true,
            current_version: CURRENT_HOOK_VERSION,
            outdated: installed_version != Some(CURRENT_HOOK_VERSION),
            installed_version,
            config_path: Some(config_path.into()),
            error: None,
        }
    }

    fn failed(config_path: impl Into<String>, error: impl Into<String>) -> Self {
        Self {
            detected: true,
            installed: false,
            current_version: CURRENT_HOOK_VERSION,
            outdated: false,
            installed_version: None,
            config_path: Some(config_path.into()),
            error: Some(error.into()),
        }
    }
}

pub(super) fn hook_version_assignment() -> String {
    format!("ATMOS_HOOK_VERSION={CURRENT_HOOK_VERSION}")
}

pub(super) fn hook_version_header_shell() -> String {
    format!(r#"-H "X-Atmos-Hook-Version: {CURRENT_HOOK_VERSION}""#)
}

pub(super) fn hook_version_header_ts() -> String {
    r#""X-Atmos-Hook-Version": String(ATMOS_HOOK_VERSION),"#.to_string()
}

pub(super) fn installed_status_from_content(
    config_path: impl Into<String>,
    installed: bool,
    content: &str,
) -> AgentHookToolStatus {
    if !installed {
        return AgentHookToolStatus::detected_uninstalled(config_path);
    }
    AgentHookToolStatus::detected_installed(config_path, parse_hook_version(content))
}

pub(super) fn installed_status_from_versions(
    config_path: impl Into<String>,
    installed_versions: impl IntoIterator<Item = Option<u32>>,
) -> AgentHookToolStatus {
    let versions: Vec<Option<u32>> = installed_versions.into_iter().collect();
    if versions.is_empty() {
        return AgentHookToolStatus::detected_uninstalled(config_path);
    }
    let installed_version = versions
        .iter()
        .copied()
        .flatten()
        .min()
        .or(Some(LEGACY_HOOK_VERSION));
    AgentHookToolStatus::detected_installed(config_path, installed_version)
}

pub(super) fn parse_hook_version(content: &str) -> Option<u32> {
    let marker = "ATMOS_HOOK_VERSION";
    let start = content.find(marker)? + marker.len();
    let rest = content[start..]
        .trim_start_matches(|ch: char| ch == '"' || ch == '\'' || ch.is_whitespace());
    let rest = rest
        .strip_prefix('=')
        .or_else(|| rest.strip_prefix(':'))
        .unwrap_or(rest)
        .trim_start_matches(|ch: char| ch == '"' || ch == '\'' || ch.is_whitespace());
    let digits: String = rest.chars().take_while(|ch| ch.is_ascii_digit()).collect();
    digits.parse().ok()
}

pub(super) fn parse_hook_version_from_json(value: &Value) -> Option<u32> {
    match value {
        Value::String(raw) => parse_hook_version(raw),
        Value::Array(items) => items.iter().find_map(parse_hook_version_from_json),
        Value::Object(map) => map.values().find_map(parse_hook_version_from_json),
        _ => None,
    }
}

pub fn install_all_hooks(port: u16) -> AgentHookInstallReport {
    info!("Installing agent hooks for Atmos port {}", port);

    let claude = claude_code::install(port);
    let codex = codex::install(port);
    let cursor = cursor::install(port);
    let gemini_status = gemini::install(port);
    let antigravity_status = antigravity::install(port);
    let factory = factory_droid::install(port);
    let kiro_status = kiro::install(port);
    let opencode = opencode::install(port);
    let ampcode = ampcode::install(port);
    let pi_status = pi::install(port);
    let hermes_status = hermes::install(port);
    let grok_build_status = grok_build::install(port);

    info!(
        "Agent hook install complete: claude_code={}, codex={}, cursor={}, gemini={}, antigravity={}, factory_droid={}, kiro={}, opencode={}, ampcode={}, pi={}, hermes={}, grok_build={}",
        if claude.installed { "ok" } else { "skip" },
        if codex.installed { "ok" } else { "skip" },
        if cursor.installed { "ok" } else { "skip" },
        if gemini_status.installed {
            "ok"
        } else {
            "skip"
        },
        if antigravity_status.installed {
            "ok"
        } else {
            "skip"
        },
        if factory.installed { "ok" } else { "skip" },
        if kiro_status.installed { "ok" } else { "skip" },
        if opencode.installed { "ok" } else { "skip" },
        if ampcode.installed { "ok" } else { "skip" },
        if pi_status.installed { "ok" } else { "skip" },
        if hermes_status.installed {
            "ok"
        } else {
            "skip"
        },
        if grok_build_status.installed {
            "ok"
        } else {
            "skip"
        },
    );

    AgentHookInstallReport {
        claude_code: claude,
        codex,
        cursor,
        gemini: gemini_status,
        antigravity: antigravity_status,
        factory_droid: factory,
        kiro: kiro_status,
        opencode,
        ampcode,
        pi: pi_status,
        hermes: hermes_status,
        grok_build: grok_build_status,
    }
}

pub fn uninstall_all_hooks() -> AgentHookInstallReport {
    info!("Uninstalling agent hooks");

    let claude = claude_code::uninstall();
    let codex = codex::uninstall();
    let cursor = cursor::uninstall();
    let gemini_status = gemini::uninstall();
    let antigravity_status = antigravity::uninstall();
    let factory = factory_droid::uninstall();
    let kiro_status = kiro::uninstall();
    let opencode = opencode::uninstall();
    let ampcode = ampcode::uninstall();
    let pi_status = pi::uninstall();
    let hermes_status = hermes::uninstall();
    let grok_build_status = grok_build::uninstall();

    AgentHookInstallReport {
        claude_code: claude,
        codex,
        cursor,
        gemini: gemini_status,
        antigravity: antigravity_status,
        factory_droid: factory,
        kiro: kiro_status,
        opencode,
        ampcode,
        pi: pi_status,
        hermes: hermes_status,
        grok_build: grok_build_status,
    }
}

pub fn check_all_hooks() -> AgentHookInstallReport {
    let claude = claude_code::check();
    let codex = codex::check();
    let cursor = cursor::check();
    let gemini_status = gemini::check();
    let antigravity_status = antigravity::check();
    let factory = factory_droid::check();
    let kiro_status = kiro::check();
    let opencode = opencode::check();
    let ampcode = ampcode::check();
    let pi_status = pi::check();
    let hermes_status = hermes::check();
    let grok_build_status = grok_build::check();

    AgentHookInstallReport {
        claude_code: claude,
        codex,
        cursor,
        gemini: gemini_status,
        antigravity: antigravity_status,
        factory_droid: factory,
        kiro: kiro_status,
        opencode,
        ampcode,
        pi: pi_status,
        hermes: hermes_status,
        grok_build: grok_build_status,
    }
}

fn sync_hook_if_installed(
    tool: &str,
    status: AgentHookToolStatus,
    install: impl FnOnce() -> AgentHookToolStatus,
) -> AgentHookToolStatus {
    if !status.installed {
        return status;
    }

    if status.outdated {
        info!(
            "Upgrading {} agent hook from v{} to v{}",
            tool,
            status.installed_version.unwrap_or(LEGACY_HOOK_VERSION),
            CURRENT_HOOK_VERSION
        );
    }

    install()
}

/// Refresh only Atmos-managed hooks that are already installed. This keeps the
/// hardcoded API port and template version current without auto-installing hooks
/// for tools that were detected but never opted into Atmos hooks.
pub fn sync_installed_hooks(port: u16) -> AgentHookInstallReport {
    let claude = sync_hook_if_installed("claude_code", claude_code::check(), || {
        claude_code::install(port)
    });
    let codex = sync_hook_if_installed("codex", codex::check(), || codex::install(port));
    let cursor = sync_hook_if_installed("cursor", cursor::check(), || cursor::install(port));
    let gemini_status = sync_hook_if_installed("gemini", gemini::check(), || gemini::install(port));
    let antigravity_status = sync_hook_if_installed("antigravity", antigravity::check(), || {
        antigravity::install(port)
    });
    let factory = sync_hook_if_installed("factory_droid", factory_droid::check(), || {
        factory_droid::install(port)
    });
    let kiro_status = sync_hook_if_installed("kiro", kiro::check(), || kiro::install(port));
    let opencode =
        sync_hook_if_installed("opencode", opencode::check(), || opencode::install(port));
    let ampcode = sync_hook_if_installed("ampcode", ampcode::check(), || ampcode::install(port));
    let pi_status = sync_hook_if_installed("pi", pi::check(), || pi::install(port));
    let hermes_status = sync_hook_if_installed("hermes", hermes::check(), || hermes::install(port));
    let grok_build_status = sync_hook_if_installed("grok_build", grok_build::check(), || {
        grok_build::install(port)
    });

    AgentHookInstallReport {
        claude_code: claude,
        codex,
        cursor,
        gemini: gemini_status,
        antigravity: antigravity_status,
        factory_droid: factory,
        kiro: kiro_status,
        opencode,
        ampcode,
        pi: pi_status,
        hermes: hermes_status,
        grok_build: grok_build_status,
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
        "antigravity" => antigravity::install(port),
        "factory_droid" => factory_droid::install(port),
        "kiro" => kiro::install(port),
        "opencode" => opencode::install(port),
        "ampcode" => ampcode::install(port),
        "pi" => pi::install(port),
        "hermes" => hermes::install(port),
        "grok_build" | "grok-build" => grok_build::install(port),
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
        "antigravity" => antigravity::uninstall(),
        "factory_droid" => factory_droid::uninstall(),
        "kiro" => kiro::uninstall(),
        "opencode" => opencode::uninstall(),
        "ampcode" => ampcode::uninstall(),
        "pi" => pi::uninstall(),
        "hermes" => hermes::uninstall(),
        "grok_build" | "grok-build" => grok_build::uninstall(),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;

    use super::*;

    #[test]
    fn parses_hook_version_markers() {
        assert_eq!(parse_hook_version("ATMOS_HOOK_VERSION=2"), Some(2));
        assert_eq!(
            parse_hook_version("const ATMOS_HOOK_VERSION = 12"),
            Some(12)
        );
        assert_eq!(parse_hook_version(r#""ATMOS_HOOK_VERSION": "3""#), Some(3));
    }

    #[test]
    fn parses_hook_version_from_nested_json() {
        let value = serde_json::json!({
            "hooks": [
                {
                    "type": "command",
                    "command": "[ \"$ATMOS_MANAGED\" = \"1\" ] && ATMOS_HOOK_VERSION=2 && curl"
                }
            ]
        });

        assert_eq!(parse_hook_version_from_json(&value), Some(2));
    }

    #[test]
    fn missing_version_on_installed_hook_is_legacy() {
        let status = installed_status_from_versions("/tmp/hook", [None]);

        assert!(status.installed);
        assert!(status.outdated);
        assert_eq!(status.installed_version, Some(LEGACY_HOOK_VERSION));
        assert_eq!(status.current_version, CURRENT_HOOK_VERSION);
    }

    #[test]
    fn installed_status_tracks_current_and_mixed_versions() {
        let current = installed_status_from_versions("/tmp/hook", [Some(CURRENT_HOOK_VERSION)]);
        assert!(current.installed);
        assert!(!current.outdated);
        assert_eq!(current.installed_version, Some(CURRENT_HOOK_VERSION));

        let mixed = installed_status_from_versions(
            "/tmp/hook",
            [Some(CURRENT_HOOK_VERSION), Some(LEGACY_HOOK_VERSION)],
        );
        assert!(mixed.installed);
        assert!(mixed.outdated);
        assert_eq!(mixed.installed_version, Some(LEGACY_HOOK_VERSION));
    }

    #[test]
    fn installed_status_from_empty_versions_is_uninstalled() {
        let status = installed_status_from_versions("/tmp/hook", []);

        assert!(status.detected);
        assert!(!status.installed);
        assert!(!status.outdated);
        assert_eq!(status.installed_version, None);
    }

    #[test]
    fn sync_hook_skips_uninstalled_hooks() {
        let called = Cell::new(false);
        let status = AgentHookToolStatus::detected_uninstalled("/tmp/hook");

        let result = sync_hook_if_installed("codex", status, || {
            called.set(true);
            AgentHookToolStatus::success("/tmp/hook")
        });

        assert!(!called.get());
        assert!(!result.installed);
    }

    #[test]
    fn sync_hook_refreshes_installed_hooks() {
        let called = Cell::new(false);
        let status =
            AgentHookToolStatus::detected_installed("/tmp/hook", Some(CURRENT_HOOK_VERSION));

        let result = sync_hook_if_installed("codex", status, || {
            called.set(true);
            AgentHookToolStatus::success("/tmp/hook")
        });

        assert!(called.get());
        assert!(result.installed);
        assert_eq!(result.installed_version, Some(CURRENT_HOOK_VERSION));
    }

    #[test]
    fn sync_hook_upgrades_outdated_hooks() {
        let called = Cell::new(false);
        let status =
            AgentHookToolStatus::detected_installed("/tmp/hook", Some(LEGACY_HOOK_VERSION));

        let result = sync_hook_if_installed("codex", status, || {
            called.set(true);
            AgentHookToolStatus::success("/tmp/hook")
        });

        assert!(called.get());
        assert!(result.installed);
        assert!(!result.outdated);
        assert_eq!(result.installed_version, Some(CURRENT_HOOK_VERSION));
    }
}
