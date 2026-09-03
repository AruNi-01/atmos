//! Atmos-owned Chat permission vocabulary. Host adapters map to vendor ids.

use crate::contract::AgentMode;

use super::aliases::canonicalize_chat_provider_id;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum AtmosPermission {
    Yolo,
    AcceptEdits,
    Auto,
    AskAlways,
}

impl AtmosPermission {
    pub const DEFAULT: Self = Self::AskAlways;

    pub const DISPLAY_ORDER: [Self; 4] =
        [Self::Yolo, Self::AcceptEdits, Self::Auto, Self::AskAlways];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Yolo => "yolo",
            Self::AcceptEdits => "accept_edits",
            Self::Auto => "auto",
            Self::AskAlways => "ask_always",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Yolo => "Yolo",
            Self::AcceptEdits => "Accept edits",
            Self::Auto => "Auto",
            Self::AskAlways => "Ask always",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match compact(raw).as_str() {
            "yolo" => Some(Self::Yolo),
            "acceptedits" => Some(Self::AcceptEdits),
            "auto" => Some(Self::Auto),
            "askalways" => Some(Self::AskAlways),
            _ => None,
        }
    }

    pub fn to_mode(self, is_default: bool) -> AgentMode {
        AgentMode {
            id: self.as_str().to_string(),
            label: self.label().to_string(),
            is_default,
        }
    }
}

fn compact(raw: &str) -> String {
    raw.trim()
        .to_ascii_lowercase()
        .chars()
        .filter(|ch| *ch != '-' && *ch != '_')
        .collect()
}

pub fn is_plan_mode(raw: Option<&str>) -> bool {
    raw.map(str::trim)
        .is_some_and(|id| id.eq_ignore_ascii_case("plan"))
}

pub fn plan_encodes_as_permission(host: &str) -> bool {
    matches!(canonicalize_chat_provider_id(host), "claude" | "grok")
}

pub fn default_collaboration_modes() -> Vec<AgentMode> {
    vec![
        AgentMode {
            id: "default".into(),
            label: "Default".into(),
            is_default: true,
        },
        AgentMode {
            id: "plan".into(),
            label: "Plan".into(),
            is_default: false,
        },
    ]
}

pub fn advertised(host: &str) -> Vec<AtmosPermission> {
    match canonicalize_chat_provider_id(host) {
        "claude" | "grok" => AtmosPermission::DISPLAY_ORDER.to_vec(),
        "codex" => vec![AtmosPermission::Yolo, AtmosPermission::AskAlways],
        _ => Vec::new(),
    }
}

pub fn advertised_permission_modes(host: &str) -> Vec<AgentMode> {
    modes_from_present(advertised(host), Some(AtmosPermission::DEFAULT))
}

/// Classify a vendor or Atmos permission id. `plan` is a mode, not a permission.
pub fn classify(raw: &str) -> Option<AtmosPermission> {
    if is_plan_mode(Some(raw)) {
        return None;
    }
    if let Some(parsed) = AtmosPermission::parse(raw) {
        return Some(parsed);
    }
    let c = compact(raw);
    if c.contains("bypass")
        || c.contains("yolo")
        || c == "never"
        || c == "dontask"
        || c == "allow"
        || c == "alwaysapprove"
    {
        return Some(AtmosPermission::Yolo);
    }
    if c.contains("acceptedits") {
        return Some(AtmosPermission::AcceptEdits);
    }
    if c == "auto" {
        return Some(AtmosPermission::Auto);
    }
    if c == "default"
        || c == "ask"
        || c == "onrequest"
        || c == "manual"
        || c == "untrusted"
        || c == "granular"
    {
        return Some(AtmosPermission::AskAlways);
    }
    None
}

pub fn to_vendor(host: &str, atmos: AtmosPermission) -> Option<&'static str> {
    match canonicalize_chat_provider_id(host) {
        "claude" | "grok" => Some(match atmos {
            AtmosPermission::Yolo => "bypassPermissions",
            AtmosPermission::AcceptEdits => "acceptEdits",
            AtmosPermission::Auto => "auto",
            AtmosPermission::AskAlways => "default",
        }),
        "codex" => match atmos {
            AtmosPermission::Yolo => Some("never"),
            AtmosPermission::AskAlways => Some("on-request"),
            _ => None,
        },
        "opencode" => match atmos {
            AtmosPermission::Yolo => Some("allow"),
            AtmosPermission::AskAlways => Some("ask"),
            _ => None,
        },
        "pi" => None,
        _ => Some(match atmos {
            AtmosPermission::Yolo => "bypassPermissions",
            AtmosPermission::AcceptEdits => "acceptEdits",
            AtmosPermission::Auto => "auto",
            AtmosPermission::AskAlways => "default",
        }),
    }
}

pub fn to_vendor_value(host: &str, raw: &str) -> Option<String> {
    let atmos = AtmosPermission::parse(raw).or_else(|| classify(raw))?;
    to_vendor(host, atmos).map(str::to_string)
}

/// Persist an Atmos id. Unknown strings that do not classify are left unchanged.
pub fn normalize_stored(raw: &str) -> Option<String> {
    classify(raw)
        .or_else(|| AtmosPermission::parse(raw))
        .map(|atmos| atmos.as_str().to_string())
}

pub fn vendor_permission_for_spawn(
    host: &str,
    mode: Option<&str>,
    permission: Option<&str>,
) -> Option<String> {
    if is_plan_mode(mode) && plan_encodes_as_permission(host) {
        return Some("plan".into());
    }
    let raw = permission
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    to_vendor_value(host, raw)
}

pub fn fold_vendor_permission_modes(items: &[AgentMode]) -> Vec<AgentMode> {
    let mut present = Vec::new();
    let mut default_atmos = None;
    for item in items {
        if is_plan_mode(Some(&item.id)) {
            continue;
        }
        let Some(atmos) = classify(&item.id) else {
            continue;
        };
        if item.is_default {
            default_atmos = Some(atmos);
        }
        if !present.contains(&atmos) {
            present.push(atmos);
        }
    }
    modes_from_present(present, default_atmos)
}

pub fn extract_plan_mode(items: &[AgentMode]) -> Option<AgentMode> {
    items
        .iter()
        .any(|item| is_plan_mode(Some(&item.id)))
        .then(|| AgentMode {
            id: "plan".into(),
            label: "Plan".into(),
            is_default: false,
        })
}

pub fn merge_plan_into_modes(modes: &mut Vec<AgentMode>, items: &[AgentMode]) {
    let Some(plan) = extract_plan_mode(items) else {
        return;
    };
    if !modes.iter().any(|item| is_plan_mode(Some(&item.id))) {
        modes.push(plan);
    }
}

fn modes_from_present(
    present: Vec<AtmosPermission>,
    default_atmos: Option<AtmosPermission>,
) -> Vec<AgentMode> {
    if present.is_empty() {
        return Vec::new();
    }
    let default = default_atmos
        .filter(|item| present.contains(item))
        .or_else(|| {
            present
                .contains(&AtmosPermission::DEFAULT)
                .then_some(AtmosPermission::DEFAULT)
        })
        .or(present.first().copied());
    AtmosPermission::DISPLAY_ORDER
        .into_iter()
        .filter(|item| present.contains(item))
        .map(|item| item.to_mode(Some(item) == default))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_vendor_aliases_and_ignores_plan() {
        assert_eq!(classify("bypassPermissions"), Some(AtmosPermission::Yolo));
        assert_eq!(classify("dontAsk"), Some(AtmosPermission::Yolo));
        assert_eq!(classify("never"), Some(AtmosPermission::Yolo));
        assert_eq!(classify("acceptEdits"), Some(AtmosPermission::AcceptEdits));
        assert_eq!(classify("auto"), Some(AtmosPermission::Auto));
        assert_eq!(classify("default"), Some(AtmosPermission::AskAlways));
        assert_eq!(classify("on-request"), Some(AtmosPermission::AskAlways));
        assert_eq!(classify("ask"), Some(AtmosPermission::AskAlways));
        assert_eq!(classify("ask_always"), Some(AtmosPermission::AskAlways));
        assert_eq!(classify("yolo"), Some(AtmosPermission::Yolo));
        assert!(classify("plan").is_none());
    }

    #[test]
    fn native_vendor_maps_round_trip() {
        assert_eq!(
            to_vendor("claude", AtmosPermission::Yolo),
            Some("bypassPermissions")
        );
        assert_eq!(
            to_vendor("claude", AtmosPermission::AskAlways),
            Some("default")
        );
        assert_eq!(to_vendor("codex", AtmosPermission::Yolo), Some("never"));
        assert_eq!(
            to_vendor("codex", AtmosPermission::AskAlways),
            Some("on-request")
        );
        assert!(to_vendor("codex", AtmosPermission::Auto).is_none());
        assert_eq!(
            to_vendor("grok", AtmosPermission::AcceptEdits),
            Some("acceptEdits")
        );
        assert_eq!(to_vendor("opencode", AtmosPermission::Yolo), Some("allow"));
        assert!(to_vendor("pi", AtmosPermission::AskAlways).is_none());
        assert_eq!(
            normalize_stored("bypassPermissions").as_deref(),
            Some("yolo")
        );
        assert_eq!(
            normalize_stored("on-request").as_deref(),
            Some("ask_always")
        );
    }

    #[test]
    fn plan_mode_wins_on_claude_and_grok_spawn() {
        assert_eq!(
            vendor_permission_for_spawn("claude", Some("plan"), Some("yolo")).as_deref(),
            Some("plan")
        );
        assert_eq!(
            vendor_permission_for_spawn("grok", Some("plan"), Some("ask_always")).as_deref(),
            Some("plan")
        );
        assert_eq!(
            vendor_permission_for_spawn("codex", Some("plan"), Some("yolo")).as_deref(),
            Some("never")
        );
        assert_eq!(
            vendor_permission_for_spawn("claude", Some("default"), Some("yolo")).as_deref(),
            Some("bypassPermissions")
        );
    }

    #[test]
    fn fold_drops_plan_and_dedupes_to_atmos_ids() {
        let folded = fold_vendor_permission_modes(&[
            AgentMode {
                id: "default".into(),
                label: "Default".into(),
                is_default: true,
            },
            AgentMode {
                id: "plan".into(),
                label: "Plan".into(),
                is_default: false,
            },
            AgentMode {
                id: "bypassPermissions".into(),
                label: "Bypass".into(),
                is_default: false,
            },
            AgentMode {
                id: "dontAsk".into(),
                label: "Don't ask".into(),
                is_default: false,
            },
        ]);
        assert_eq!(
            folded
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["yolo", "ask_always"]
        );
        assert!(folded
            .iter()
            .any(|item| item.id == "ask_always" && item.is_default));
        assert!(extract_plan_mode(&[AgentMode {
            id: "plan".into(),
            label: "Plan".into(),
            is_default: false,
        }])
        .is_some());
    }

    #[test]
    fn advertised_native_subsets() {
        let claude = advertised_permission_modes("claude");
        assert_eq!(
            claude
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["yolo", "accept_edits", "auto", "ask_always"]
        );
        assert!(claude
            .iter()
            .any(|item| item.id == "ask_always" && item.is_default));
        let codex = advertised_permission_modes("codex");
        assert_eq!(
            codex
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            ["yolo", "ask_always"]
        );
        assert!(advertised_permission_modes("pi").is_empty());
        assert!(advertised_permission_modes("factory-droid").is_empty());
    }
}
