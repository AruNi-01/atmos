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

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::info;

use crate::error::{EngineError, Result};

// v3: optional `${VAR:-}` expansion so Grok's required-env preflight does not
// skip Atmos hooks when side-chat (or other) vars are unset in the process env.
pub const CURRENT_HOOK_VERSION: u32 = 3;
const LEGACY_HOOK_VERSION: u32 = 1;

/// Canonical tool keys used by install/uninstall APIs and opt-out persistence.
const HOOK_TOOL_KEYS: &[&str] = &[
    "claude_code",
    "codex",
    "cursor",
    "gemini",
    "antigravity",
    "factory_droid",
    "kiro",
    "opencode",
    "ampcode",
    "pi",
    "hermes",
    "grok_build",
];

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

/// Shell test that Atmos is managing this terminal.
///
/// Uses `${ATMOS_MANAGED:-}` so Grok's hook runner (which treats bare `$VAR` /
/// `${VAR}` in `command` as required) still executes the hook when the var is
/// unset; the shell guard then no-ops cleanly.
pub(super) fn atmos_managed_guard() -> &'static str {
    r#"[ "${ATMOS_MANAGED:-}" = "1" ]"#
}

/// Curl header fragment for Atmos pane / side-chat context.
///
/// Side-chat vars are only injected for side-chat terminals; use empty-default
/// expansion so normal panes (and Grok's required-env preflight) still run.
pub(super) fn atmos_context_curl_headers() -> &'static str {
    concat!(
        r#"-H "X-Atmos-Context: ${ATMOS_CONTEXT_ID:-}" "#,
        r#"-H "X-Atmos-Pane: ${ATMOS_PANE_ID:-}" "#,
        r#"-H "X-Atmos-Terminal-Kind: ${ATMOS_TERMINAL_KIND:-}" "#,
        r#"-H "X-Atmos-Side-Chat-Id: ${ATMOS_SIDE_CHAT_ID:-}" "#,
        r#"-H "X-Atmos-Source-Pane: ${ATMOS_SOURCE_PANE_ID:-}""#,
    )
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

    // Explicit install-all re-enables every known tool for future auto-sync.
    clear_disabled_tools(HOOK_TOOL_KEYS.iter().copied());

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

    // Remember the opt-out so startup auto-install does not undo the uninstall.
    mark_tools_disabled(HOOK_TOOL_KEYS.iter().copied());

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

/// Decide whether startup sync should (re)install a tool's Atmos hooks.
///
/// Policy:
/// - not detected → skip
/// - user opted out via uninstall → skip (unless already installed; then refresh)
/// - detected and not opted out → install / refresh (port + version)
fn ensure_hook_for_tool(
    tool: &str,
    status: AgentHookToolStatus,
    user_disabled: bool,
    install: impl FnOnce() -> AgentHookToolStatus,
) -> AgentHookToolStatus {
    if !status.detected {
        return status;
    }

    // If hooks are present on disk, always refresh port/version even if the user
    // previously opted out (files may have been restored manually).
    if status.installed {
        if status.outdated {
            info!(
                "Upgrading {} agent hook from v{} to v{}",
                tool,
                status.installed_version.unwrap_or(LEGACY_HOOK_VERSION),
                CURRENT_HOOK_VERSION
            );
        }
        return install();
    }

    if user_disabled {
        info!(
            "Skipping {} agent hook auto-install (user uninstalled / opted out)",
            tool
        );
        return status;
    }

    info!("Auto-installing {} agent hooks (CLI detected)", tool);
    install()
}

/// On API startup: auto-install Atmos hooks for every detected CLI agent unless
/// the user explicitly uninstalled that tool, and refresh already-installed hooks
/// so the localhost port and template version stay current.
pub fn sync_installed_hooks(port: u16) -> AgentHookInstallReport {
    let disabled = load_disabled_tools();

    let claude = ensure_hook_for_tool(
        "claude_code",
        claude_code::check(),
        disabled.contains("claude_code"),
        || claude_code::install(port),
    );
    let codex = ensure_hook_for_tool("codex", codex::check(), disabled.contains("codex"), || {
        codex::install(port)
    });
    let cursor = ensure_hook_for_tool(
        "cursor",
        cursor::check(),
        disabled.contains("cursor"),
        || cursor::install(port),
    );
    let gemini_status = ensure_hook_for_tool(
        "gemini",
        gemini::check(),
        disabled.contains("gemini"),
        || gemini::install(port),
    );
    let antigravity_status = ensure_hook_for_tool(
        "antigravity",
        antigravity::check(),
        disabled.contains("antigravity"),
        || antigravity::install(port),
    );
    let factory = ensure_hook_for_tool(
        "factory_droid",
        factory_droid::check(),
        disabled.contains("factory_droid"),
        || factory_droid::install(port),
    );
    let kiro_status =
        ensure_hook_for_tool("kiro", kiro::check(), disabled.contains("kiro"), || {
            kiro::install(port)
        });
    let opencode = ensure_hook_for_tool(
        "opencode",
        opencode::check(),
        disabled.contains("opencode"),
        || opencode::install(port),
    );
    let ampcode = ensure_hook_for_tool(
        "ampcode",
        ampcode::check(),
        disabled.contains("ampcode"),
        || ampcode::install(port),
    );
    let pi_status = ensure_hook_for_tool("pi", pi::check(), disabled.contains("pi"), || {
        pi::install(port)
    });
    let hermes_status = ensure_hook_for_tool(
        "hermes",
        hermes::check(),
        disabled.contains("hermes"),
        || hermes::install(port),
    );
    let grok_build_status = ensure_hook_for_tool(
        "grok_build",
        grok_build::check(),
        disabled.contains("grok_build"),
        || grok_build::install(port),
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

fn home_dir() -> Result<PathBuf> {
    dirs::home_dir()
        .ok_or_else(|| EngineError::Processing("Cannot determine home directory".into()))
}

fn normalize_tool_key(tool: &str) -> Option<&'static str> {
    match tool {
        "claude_code" => Some("claude_code"),
        "codex" => Some("codex"),
        "cursor" => Some("cursor"),
        "gemini" => Some("gemini"),
        "antigravity" => Some("antigravity"),
        "factory_droid" => Some("factory_droid"),
        "kiro" => Some("kiro"),
        "opencode" => Some("opencode"),
        "ampcode" => Some("ampcode"),
        "pi" => Some("pi"),
        "hermes" => Some("hermes"),
        "grok_build" | "grok-build" => Some("grok_build"),
        _ => None,
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct DisabledHooksFile {
    /// Tools the user explicitly uninstalled; startup will not re-install them.
    #[serde(default)]
    tools: BTreeSet<String>,
}

fn disabled_hooks_path() -> Result<PathBuf> {
    Ok(home_dir()?
        .join(".atmos")
        .join("agent-hooks")
        .join("disabled.json"))
}

fn load_disabled_tools_from(path: &Path) -> BTreeSet<String> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return BTreeSet::new(),
    };
    serde_json::from_str::<DisabledHooksFile>(&content)
        .map(|file| file.tools)
        .unwrap_or_default()
}

fn save_disabled_tools_to(path: &Path, tools: &BTreeSet<String>) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let file = DisabledHooksFile {
        tools: tools.clone(),
    };
    if let Ok(content) = serde_json::to_string_pretty(&file) {
        let _ = std::fs::write(path, content);
    }
}

fn load_disabled_tools() -> BTreeSet<String> {
    match disabled_hooks_path() {
        Ok(path) => load_disabled_tools_from(&path),
        Err(_) => BTreeSet::new(),
    }
}

fn mark_tools_disabled<'a>(tools: impl IntoIterator<Item = &'a str>) {
    let Ok(path) = disabled_hooks_path() else {
        return;
    };
    let mut disabled = load_disabled_tools_from(&path);
    for tool in tools {
        if let Some(key) = normalize_tool_key(tool) {
            disabled.insert(key.to_string());
        }
    }
    save_disabled_tools_to(&path, &disabled);
}

fn clear_disabled_tools<'a>(tools: impl IntoIterator<Item = &'a str>) {
    let Ok(path) = disabled_hooks_path() else {
        return;
    };
    let mut disabled = load_disabled_tools_from(&path);
    let before = disabled.len();
    for tool in tools {
        if let Some(key) = normalize_tool_key(tool) {
            disabled.remove(key);
        }
    }
    if disabled.len() != before {
        save_disabled_tools_to(&path, &disabled);
    }
}

/// Install hook for a single tool. Returns `None` if `tool` is not a known tool name.
pub fn install_hook(tool: &str, port: u16) -> Option<AgentHookToolStatus> {
    let key = normalize_tool_key(tool)?;
    clear_disabled_tools([key]);
    Some(match key {
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
        "grok_build" => grok_build::install(port),
        _ => return None,
    })
}

/// Uninstall hook for a single tool. Returns `None` if `tool` is not a known tool name.
pub fn uninstall_hook(tool: &str) -> Option<AgentHookToolStatus> {
    let key = normalize_tool_key(tool)?;
    let status = match key {
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
        "grok_build" => grok_build::uninstall(),
        _ => return None,
    };
    mark_tools_disabled([key]);
    Some(status)
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
    fn atmos_hook_shell_fragments_use_empty_defaults_for_grok() {
        assert_eq!(atmos_managed_guard(), r#"[ "${ATMOS_MANAGED:-}" = "1" ]"#);
        let headers = atmos_context_curl_headers();
        for name in [
            "ATMOS_CONTEXT_ID",
            "ATMOS_PANE_ID",
            "ATMOS_TERMINAL_KIND",
            "ATMOS_SIDE_CHAT_ID",
            "ATMOS_SOURCE_PANE_ID",
        ] {
            assert!(
                headers.contains(&format!("${{{name}:-}}")),
                "expected empty-default expansion for {name} in {headers}"
            );
        }
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
    fn ensure_hook_auto_installs_detected_uninstalled_when_not_disabled() {
        let called = Cell::new(false);
        let status = AgentHookToolStatus::detected_uninstalled("/tmp/hook");

        let result = ensure_hook_for_tool("codex", status, false, || {
            called.set(true);
            AgentHookToolStatus::success("/tmp/hook")
        });

        assert!(called.get());
        assert!(result.installed);
    }

    #[test]
    fn ensure_hook_skips_detected_when_user_disabled() {
        let called = Cell::new(false);
        let status = AgentHookToolStatus::detected_uninstalled("/tmp/hook");

        let result = ensure_hook_for_tool("codex", status, true, || {
            called.set(true);
            AgentHookToolStatus::success("/tmp/hook")
        });

        assert!(!called.get());
        assert!(!result.installed);
    }

    #[test]
    fn ensure_hook_skips_when_not_detected() {
        let called = Cell::new(false);
        let status = AgentHookToolStatus::not_detected();

        let result = ensure_hook_for_tool("codex", status, false, || {
            called.set(true);
            AgentHookToolStatus::success("/tmp/hook")
        });

        assert!(!called.get());
        assert!(!result.detected);
    }

    #[test]
    fn ensure_hook_refreshes_installed_hooks_even_if_disabled() {
        let called = Cell::new(false);
        let status =
            AgentHookToolStatus::detected_installed("/tmp/hook", Some(CURRENT_HOOK_VERSION));

        let result = ensure_hook_for_tool("codex", status, true, || {
            called.set(true);
            AgentHookToolStatus::success("/tmp/hook")
        });

        assert!(called.get());
        assert!(result.installed);
        assert_eq!(result.installed_version, Some(CURRENT_HOOK_VERSION));
    }

    #[test]
    fn ensure_hook_upgrades_outdated_hooks() {
        let called = Cell::new(false);
        let status =
            AgentHookToolStatus::detected_installed("/tmp/hook", Some(LEGACY_HOOK_VERSION));

        let result = ensure_hook_for_tool("codex", status, false, || {
            called.set(true);
            AgentHookToolStatus::success("/tmp/hook")
        });

        assert!(called.get());
        assert!(result.installed);
        assert!(!result.outdated);
        assert_eq!(result.installed_version, Some(CURRENT_HOOK_VERSION));
    }

    #[test]
    fn disabled_tools_file_roundtrip() {
        let dir = std::env::temp_dir().join(format!(
            "atmos-hook-disabled-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("disabled.json");

        assert!(load_disabled_tools_from(&path).is_empty());

        let mut tools = BTreeSet::new();
        tools.insert("grok_build".to_string());
        tools.insert("codex".to_string());
        save_disabled_tools_to(&path, &tools);

        let loaded = load_disabled_tools_from(&path);
        assert!(loaded.contains("grok_build"));
        assert!(loaded.contains("codex"));
        assert_eq!(loaded.len(), 2);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn normalize_tool_key_accepts_grok_aliases() {
        assert_eq!(normalize_tool_key("grok-build"), Some("grok_build"));
        assert_eq!(normalize_tool_key("grok_build"), Some("grok_build"));
        assert_eq!(normalize_tool_key("nope"), None);
    }
}
