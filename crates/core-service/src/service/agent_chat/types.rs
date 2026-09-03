use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use agent::{
    capabilities_for_provider, option_support_for_provider, AgentCurrentConfig, AgentDescriptor,
    AgentIdentity, AgentOptionSupport, AgentSessionOpRequest, AgentSupportedOptions,
    AgentThinkingSupport, AgentTool, AgentToolKind, AgentToolParams, AgentToolResult,
    AgentToolStatus, UserMessageKind,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeStatus {
    #[default]
    Detached,
    Starting,
    Ready,
    RunningTurn,
    WaitingPermission,
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentChatSessionOpOutcome {
    Applied,
    Canceled,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TurnStatus {
    #[default]
    Idle,
    Running,
    WaitingPermission,
    Completed,
    Canceled,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QueueItemStatus {
    Pending,
    Paused,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatMeta {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub deleted: bool,
    #[serde(default)]
    pub title: Option<String>,
    pub cwd: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub space_id: Option<String>,
    #[serde(default)]
    pub origin: AgentChatOrigin,
    pub provider_id: String,
    #[serde(default)]
    pub last_message_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub last_event_seq: u64,
    #[serde(default)]
    pub persistence_handle: Option<String>,
    #[serde(default)]
    pub runtime_status: RuntimeStatus,
    /// Last model actually given to a live runtime (not picker SOT).
    #[serde(default)]
    pub applied_model: Option<String>,
    #[serde(default)]
    pub applied_thinking: Option<String>,
    #[serde(default)]
    pub applied_mode: Option<String>,
    #[serde(default)]
    pub applied_permission_mode: Option<String>,
    #[serde(default)]
    pub available_commands: Vec<agent::AgentAvailableCommand>,
    #[serde(default)]
    pub session_usage: Option<SessionUsage>,
    /// Picker SOT (`supported_options` + `current_config`) and steer SOT (`capabilities.steer`).
    #[serde(default = "default_chat_descriptor")]
    pub descriptor: AgentDescriptor,
    #[serde(default)]
    pub parent_chat_id: Option<String>,
    #[serde(default)]
    pub rewind_view: Option<RewindView>,
    #[serde(default)]
    pub pending_session_op: Option<PendingSessionOp>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RewindView {
    pub until_turn_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingSessionOp {
    pub request: AgentSessionOpRequest,
    #[serde(default)]
    pub selected_turn_id: Option<String>,
}

fn default_chat_descriptor() -> AgentDescriptor {
    AgentDescriptor {
        identity: AgentIdentity {
            id: String::new(),
            name: String::new(),
            version: None,
        },
        capabilities: agent::AgentCapabilities::default(),
        support: AgentOptionSupport::default(),
        supported_options: AgentSupportedOptions::default(),
        current_config: AgentCurrentConfig::default(),
    }
}

pub fn chat_descriptor(provider_id: &str, current_config: AgentCurrentConfig) -> AgentDescriptor {
    AgentDescriptor {
        identity: AgentIdentity {
            id: provider_id.to_string(),
            name: provider_id.to_string(),
            version: None,
        },
        capabilities: capabilities_for_provider(provider_id),
        support: option_support_for_provider(provider_id),
        supported_options: AgentSupportedOptions::default(),
        current_config,
    }
}

impl AgentChatMeta {
    pub(crate) fn after_load(&mut self) {
        if self.descriptor.identity.id.is_empty() {
            self.descriptor.identity.id = self.provider_id.clone();
        }
        if self.descriptor.identity.name.is_empty() {
            self.descriptor.identity.name = self.provider_id.clone();
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionUsage {
    #[serde(default)]
    pub used: Option<u64>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub cost: Option<SessionCost>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionCost {
    #[serde(default)]
    pub amount: Option<f64>,
    #[serde(default)]
    pub currency: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TurnUsage {
    #[serde(default)]
    pub total_tokens: Option<u64>,
    #[serde(default)]
    pub input_tokens: Option<u64>,
    #[serde(default)]
    pub output_tokens: Option<u64>,
    #[serde(default)]
    pub thought_tokens: Option<u64>,
    #[serde(default)]
    pub cached_read_tokens: Option<u64>,
    #[serde(default)]
    pub cached_write_tokens: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatIndexEntry {
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    pub cwd: String,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub space_id: Option<String>,
    #[serde(default)]
    pub origin: AgentChatOrigin,
    pub provider_id: String,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub last_message_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub deleted: bool,
}

impl From<&AgentChatMeta> for AgentChatIndexEntry {
    fn from(meta: &AgentChatMeta) -> Self {
        Self {
            id: meta.id.clone(),
            title: meta.title.clone(),
            cwd: meta.cwd.clone(),
            workspace_id: meta.workspace_id.clone(),
            project_id: meta.project_id.clone(),
            space_id: meta.space_id.clone(),
            origin: meta.origin,
            provider_id: meta.provider_id.clone(),
            updated_at: meta.updated_at,
            last_message_at: meta.last_message_at,
            deleted: meta.deleted,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AgentChatOrigin {
    #[default]
    Normal,
    Quick,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionLifecycleAction {
    Create,
    Resume,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionLifecycleStatus {
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionHintTone {
    Info,
    Warning,
    Error,
}

pub const SESSION_HINT_MODEL_SWITCH_FAILED: &str = "model_switch_failed";
pub const SESSION_HINT_MODE_SWITCH_FAILED: &str = "mode_switch_failed";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionConfigValueChange {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
    pub to: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionConfigChange {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<SessionConfigValueChange>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<SessionConfigValueChange>,
}

impl SessionConfigChange {
    pub fn is_empty(&self) -> bool {
        self.model.is_none() && self.mode.is_none()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SessionAdvertisedOptionValue {
    pub value: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct SessionAdvertisedOption {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default, rename = "type", alias = "type")]
    pub option_type: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "currentValue"
    )]
    pub current_value: Option<String>,
    #[serde(default)]
    pub options: Vec<SessionAdvertisedOptionValue>,
}

pub fn config_kind_matches(id: &str, category: Option<&str>, kind: &str) -> bool {
    let aliases: &[&str] = match kind {
        "model" => &["model", "models"],
        "mode" => &["mode", "modes"],
        "permission_mode" => &[
            "permission_mode",
            "permissionMode",
            "permission_modes",
            "permissionModes",
            "permission",
            "approval",
        ],
        "thinking" => &[
            "thinking",
            "think",
            "thought_level",
            "effort",
            "reasoning",
            "reasoning_effort",
            "reasoning-effort",
        ],
        _ => return id.eq_ignore_ascii_case(kind),
    };
    aliases.iter().any(|alias| {
        id.eq_ignore_ascii_case(alias)
            || category.is_some_and(|item| item.eq_ignore_ascii_case(alias))
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResolvedSessionConfig {
    Advertised { config_id: String, value: String },
    PassThrough(String),
    Invalid,
}

pub fn advertised_option_for_kind<'a>(
    options: &'a [SessionAdvertisedOption],
    kind: &str,
) -> Option<&'a SessionAdvertisedOption> {
    options
        .iter()
        .find(|option| config_kind_matches(&option.id, option.category.as_deref(), kind))
}

/// Map a host/catalog value onto an advertised select option.
/// ACP requires `session/set_config_option` values to be listed in `options`.
pub fn map_advertised_select_value(
    option: &SessionAdvertisedOption,
    requested: &str,
) -> Option<String> {
    let requested = requested.trim();
    if requested.is_empty() {
        return None;
    }
    if option.options.is_empty() {
        return Some(requested.to_string());
    }
    let exact = option
        .options
        .iter()
        .find(|item| item.value.trim() == requested);
    if let Some(item) = exact {
        return Some(item.value.clone());
    }
    let named = option.options.iter().find(|item| {
        config_values_equal(&item.value, requested)
            || item
                .name
                .as_deref()
                .is_some_and(|name| config_values_equal(name, requested))
    });
    if let Some(item) = named {
        return Some(item.value.clone());
    }
    let fuzzy: Vec<&SessionAdvertisedOptionValue> = option
        .options
        .iter()
        .filter(|item| {
            config_values_fuzzy(&item.value, requested)
                || item
                    .name
                    .as_deref()
                    .is_some_and(|name| config_values_fuzzy(name, requested))
        })
        .collect();
    (fuzzy.len() == 1).then(|| fuzzy[0].value.clone())
}

fn option_from_supported(meta: &AgentChatMeta, kind: &str) -> Option<SessionAdvertisedOption> {
    match kind {
        "model" => {
            let models = &meta.descriptor.supported_options.models;
            if models.is_empty() {
                return None;
            }
            Some(SessionAdvertisedOption {
                id: "model".into(),
                name: None,
                category: Some("model".into()),
                option_type: "select".into(),
                current_value: meta.descriptor.current_config.model.clone(),
                options: models
                    .iter()
                    .map(|model| SessionAdvertisedOptionValue {
                        value: model.id.clone(),
                        name: Some(model.label.clone()),
                    })
                    .collect(),
            })
        }
        "mode" => {
            let modes = &meta.descriptor.supported_options.modes;
            if modes.is_empty() {
                return None;
            }
            Some(SessionAdvertisedOption {
                id: "mode".into(),
                name: None,
                category: Some("mode".into()),
                option_type: "select".into(),
                current_value: meta.descriptor.current_config.mode.clone(),
                options: modes
                    .iter()
                    .map(|mode| SessionAdvertisedOptionValue {
                        value: mode.id.clone(),
                        name: Some(mode.label.clone()),
                    })
                    .collect(),
            })
        }
        "thinking" => match &meta.descriptor.supported_options.thinking {
            AgentThinkingSupport::Enum { options, .. } if !options.is_empty() => {
                Some(SessionAdvertisedOption {
                    id: "thinking".into(),
                    name: None,
                    category: Some("thinking".into()),
                    option_type: "select".into(),
                    current_value: meta.descriptor.current_config.thinking.clone(),
                    options: options
                        .iter()
                        .map(|value| SessionAdvertisedOptionValue {
                            value: value.clone(),
                            name: None,
                        })
                        .collect(),
                })
            }
            _ => None,
        },
        "permission_mode" => {
            let modes = &meta.descriptor.supported_options.permission_modes;
            if modes.is_empty() {
                return None;
            }
            Some(SessionAdvertisedOption {
                id: "permission_mode".into(),
                name: None,
                category: Some("permission_mode".into()),
                option_type: "select".into(),
                current_value: meta.descriptor.current_config.permission_mode.clone(),
                options: modes
                    .iter()
                    .map(|mode| SessionAdvertisedOptionValue {
                        value: mode.id.clone(),
                        name: Some(mode.label.clone()),
                    })
                    .collect(),
            })
        }
        _ => None,
    }
}

pub fn resolve_session_config_select(
    meta: &AgentChatMeta,
    kind: &str,
    requested: &str,
) -> ResolvedSessionConfig {
    let requested = requested.trim();
    if requested.is_empty() {
        return ResolvedSessionConfig::Invalid;
    }
    let Some(option) = option_from_supported(meta, kind) else {
        return ResolvedSessionConfig::PassThrough(requested.to_string());
    };
    if option.options.is_empty() {
        return ResolvedSessionConfig::PassThrough(requested.to_string());
    }
    match map_advertised_select_value(&option, requested) {
        Some(value) => ResolvedSessionConfig::PassThrough(value),
        None => ResolvedSessionConfig::PassThrough(requested.to_string()),
    }
}

pub fn keep_pending_session_selection(
    selected: Option<&String>,
    applied: Option<&String>,
    advertised_current: &str,
    option: Option<&SessionAdvertisedOption>,
) -> bool {
    if !pending_selected(selected, applied) {
        return false;
    }
    let Some(applied) = trimmed_opt(applied) else {
        return false;
    };
    if !config_values_equal(advertised_current, applied) {
        return false;
    }
    let Some(selected) = trimmed_opt(selected) else {
        return false;
    };
    match option {
        Some(option) if !option.options.is_empty() => {
            map_advertised_select_value(option, selected).is_some()
        }
        _ => true,
    }
}

pub fn merge_advertised_options(
    prev: Vec<SessionAdvertisedOption>,
    incoming: Vec<SessionAdvertisedOption>,
) -> Vec<SessionAdvertisedOption> {
    if incoming.is_empty() {
        return prev;
    }
    // ACP `set_config_option` / `config_option_update` return the complete list.
    if incoming
        .iter()
        .any(|item| !item.options.is_empty() || item.option_type.eq_ignore_ascii_case("boolean"))
    {
        return incoming;
    }
    if prev.is_empty() {
        return incoming;
    }
    let mut merged = prev;
    for item in incoming {
        if let Some(existing) = merged.iter_mut().find(|row| row.id == item.id) {
            existing.current_value = item.current_value;
        }
    }
    merged
}

fn pending_selected(selected: Option<&String>, applied: Option<&String>) -> bool {
    let selected = selected
        .map(|item| item.trim())
        .filter(|item| !item.is_empty());
    let applied = applied
        .map(|item| item.trim())
        .filter(|item| !item.is_empty());
    applied.is_some() && selected.is_some() && selected != applied
}

fn normalize_config_token(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .replace(['.', '_', ' '], "-")
}

pub fn config_values_equal(left: &str, right: &str) -> bool {
    let left = normalize_config_token(left);
    let right = normalize_config_token(right);
    !left.is_empty() && left == right
}

fn config_values_fuzzy(left: &str, right: &str) -> bool {
    let left = normalize_config_token(left);
    let right = normalize_config_token(right);
    if left.is_empty() || right.is_empty() {
        return false;
    }
    left == right
        || left.starts_with(&format!("{right}-"))
        || right.starts_with(&format!("{left}-"))
        || left.ends_with(&format!("-{right}"))
        || right.ends_with(&format!("-{left}"))
}

fn trimmed_opt(value: Option<&String>) -> Option<&str> {
    value
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
}

fn value_change(
    applied: Option<&String>,
    selected: Option<&String>,
    session_started: bool,
) -> Option<SessionConfigValueChange> {
    let to = trimmed_opt(selected)?.to_string();
    match trimmed_opt(applied) {
        Some(from) if from == to => None,
        Some(from) => Some(SessionConfigValueChange {
            from: Some(from.to_string()),
            to,
        }),
        None if session_started => Some(SessionConfigValueChange { from: None, to }),
        None => None,
    }
}

/// Host-side switch vs the last config actually given to the live runtime.
pub fn pending_session_config_change(meta: &AgentChatMeta) -> Option<SessionConfigChange> {
    let started = trimmed_opt(meta.applied_model.as_ref()).is_some()
        || trimmed_opt(meta.applied_mode.as_ref()).is_some()
        || trimmed_opt(meta.applied_thinking.as_ref()).is_some()
        || trimmed_opt(meta.applied_permission_mode.as_ref()).is_some();
    let current = &meta.descriptor.current_config;
    let change = SessionConfigChange {
        model: value_change(meta.applied_model.as_ref(), current.model.as_ref(), started),
        mode: value_change(meta.applied_mode.as_ref(), current.mode.as_ref(), started),
    };
    (!change.is_empty()).then_some(change)
}

pub fn pending_model_switch(meta: &AgentChatMeta) -> bool {
    pending_session_config_change(meta).is_some_and(|change| change.model.is_some())
}

pub fn pending_thinking_change(meta: &AgentChatMeta) -> Option<String> {
    let selected = trimmed_opt(meta.descriptor.current_config.thinking.as_ref())?.to_string();
    match trimmed_opt(meta.applied_thinking.as_ref()) {
        Some(applied) if applied == selected => None,
        _ => Some(selected),
    }
}

pub fn pending_permission_mode_change(meta: &AgentChatMeta) -> Option<String> {
    let selected =
        trimmed_opt(meta.descriptor.current_config.permission_mode.as_ref())?.to_string();
    match trimmed_opt(meta.applied_permission_mode.as_ref()) {
        Some(applied) if applied == selected => None,
        _ => Some(selected),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(clippy::large_enum_variant)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessagePart {
    Text {
        text: String,
    },
    Thinking {
        text: String,
        #[serde(default)]
        tool_call_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        duration_ms: Option<u64>,
    },
    ToolCall {
        tool_call_id: String,
        name: String,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        kind: AgentToolKind,
        status: AgentToolStatus,
        params: AgentToolParams,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        result: Option<AgentToolResult>,
    },
    Plan {
        plan: serde_json::Value,
    },
    Attachment {
        path: String,
        #[serde(default)]
        name: Option<String>,
    },
    Error {
        message: String,
    },
    SessionLifecycle {
        action: SessionLifecycleAction,
        status: SessionLifecycleStatus,
        #[serde(default)]
        duration_ms: Option<u64>,
        #[serde(default)]
        error: Option<String>,
    },
    SessionConfigChange {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<SessionConfigValueChange>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        mode: Option<SessionConfigValueChange>,
    },
    SessionHint {
        tone: SessionHintTone,
        kind: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoldedMessage {
    pub id: String,
    pub role: String,
    #[serde(default)]
    pub kind: UserMessageKind,
    pub parts: Vec<MessagePart>,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub streaming: bool,
    #[serde(default)]
    pub worked_ms: Option<u64>,
    #[serde(default)]
    pub thinking_ms: Option<u64>,
    #[serde(default)]
    pub completed_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub usage: Option<TurnUsage>,
    #[serde(default)]
    pub checkpoint_id: Option<String>,
}

impl Default for FoldedMessage {
    fn default() -> Self {
        Self {
            id: String::new(),
            role: String::new(),
            kind: UserMessageKind::Normal,
            parts: Vec::new(),
            created_at: DateTime::<Utc>::UNIX_EPOCH,
            streaming: false,
            worked_ms: None,
            thinking_ms: None,
            completed_at: None,
            usage: None,
            checkpoint_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FoldedTurn {
    pub id: String,
    pub status: TurnStatus,
    pub messages: Vec<FoldedMessage>,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub thinking_started_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub thinking_ended_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub completed_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub worked_ms: Option<u64>,
    #[serde(default)]
    pub thinking_ms: Option<u64>,
    #[serde(default)]
    pub usage: Option<TurnUsage>,
}

impl Default for FoldedTurn {
    fn default() -> Self {
        Self {
            id: String::new(),
            status: TurnStatus::Idle,
            messages: Vec::new(),
            created_at: DateTime::<Utc>::UNIX_EPOCH,
            thinking_started_at: None,
            thinking_ended_at: None,
            completed_at: None,
            worked_ms: None,
            thinking_ms: None,
            usage: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueItem {
    pub id: String,
    pub seq: u64,
    pub status: QueueItemStatus,
    pub prompt: String,
    #[serde(default)]
    pub display_prompt: Option<String>,
    #[serde(default)]
    pub attachments: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingPermission {
    pub request_id: String,
    pub tool: String,
    pub description: String,
    #[serde(default)]
    pub content_markdown: Option<String>,
    #[serde(default)]
    pub options: Vec<agent::AgentPermissionOption>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatSnapshot {
    pub meta: AgentChatMeta,
    pub messages: Vec<FoldedMessage>,
    pub queue: Vec<QueueItem>,
    #[serde(default)]
    pub pending_permission: Option<PendingPermission>,
    #[serde(default)]
    pub pending_session_op: Option<AgentSessionOpRequest>,
    #[serde(default)]
    pub running_turn_id: Option<String>,
    #[serde(default)]
    pub running_turn_started_at: Option<DateTime<Utc>>,
}

pub fn flatten_messages(
    turns: Vec<FoldedTurn>,
) -> (Vec<FoldedMessage>, Option<String>, Option<DateTime<Utc>>) {
    flatten_messages_at(turns, Utc::now())
}

pub fn flatten_messages_at(
    turns: Vec<FoldedTurn>,
    now: DateTime<Utc>,
) -> (Vec<FoldedMessage>, Option<String>, Option<DateTime<Utc>>) {
    let mut messages: Vec<FoldedMessage> = Vec::new();
    let mut running_turn_id = None;
    let mut running_turn_started_at = None;
    let mut running = false;
    for turn in turns {
        if matches!(
            turn.status,
            TurnStatus::Running | TurnStatus::WaitingPermission
        ) {
            running_turn_id = Some(turn.id.clone());
            running_turn_started_at = Some(turn.created_at);
            running = true;
        }
        let timing = turn_timing(&turn, now);
        let mut assistant_index = None;
        for message in turn.messages {
            if message.role == "assistant" {
                if let Some(last) = messages.last_mut() {
                    if last.role == "assistant" {
                        last.parts.extend(message.parts);
                        apply_turn_timing(last, &timing);
                        assistant_index = Some(messages.len() - 1);
                        continue;
                    }
                }
            }
            let is_assistant = message.role == "assistant";
            push_unique_message(&mut messages, message);
            if is_assistant {
                assistant_index = Some(messages.len() - 1);
            }
        }
        if let Some(index) = assistant_index {
            if let Some(message) = messages.get_mut(index) {
                apply_turn_timing(message, &timing);
                message.parts = order_assistant_parts(std::mem::take(&mut message.parts));
            }
        }
    }
    if running {
        if let Some(last) = messages.last_mut() {
            if last.role == "assistant" {
                last.streaming = true;
            }
        }
    }
    (messages, running_turn_id, running_turn_started_at)
}

pub fn apply_rewind_view(
    turns: Vec<FoldedTurn>,
    rewind_view: Option<&RewindView>,
) -> Vec<FoldedTurn> {
    let Some(view) = rewind_view else {
        return turns;
    };
    match turns.iter().position(|turn| turn.id == view.until_turn_id) {
        Some(index) => turns.into_iter().take(index + 1).collect(),
        None => turns,
    }
}

fn push_unique_message(messages: &mut Vec<FoldedMessage>, mut message: FoldedMessage) {
    if messages.iter().any(|item| item.id == message.id) {
        message.id = format!("{}:{}", message.id, messages.len());
    }
    messages.push(message);
}

/// Keep session lifecycle, then thinking/tools/plan, then the final answer.
pub fn order_assistant_parts(parts: Vec<MessagePart>) -> Vec<MessagePart> {
    let mut session = Vec::new();
    let mut process = Vec::new();
    let mut answer = Vec::new();
    for part in parts {
        match part {
            MessagePart::Text { .. } => answer.push(part),
            MessagePart::SessionLifecycle { .. }
            | MessagePart::SessionConfigChange { .. }
            | MessagePart::SessionHint { .. } => session.push(part),
            _ => process.push(part),
        }
    }
    session.extend(process);
    session.extend(answer);
    session
}

struct TurnTiming {
    worked_ms: Option<u64>,
    thinking_ms: Option<u64>,
    completed_at: Option<DateTime<Utc>>,
    usage: Option<TurnUsage>,
}

pub(crate) fn elapsed_ms(start: DateTime<Utc>, end: DateTime<Utc>) -> u64 {
    u64::try_from((end - start).num_milliseconds().max(0)).unwrap_or(0)
}

fn turn_timing(turn: &FoldedTurn, now: DateTime<Utc>) -> TurnTiming {
    let live = matches!(
        turn.status,
        TurnStatus::Running | TurnStatus::WaitingPermission
    );
    let completed_at = turn.completed_at;
    let worked_ms = turn.worked_ms.or_else(|| {
        if let Some(end) = completed_at {
            Some(elapsed_ms(turn.created_at, end))
        } else if live {
            Some(elapsed_ms(turn.created_at, now))
        } else {
            None
        }
    });
    let thinking_ms = turn.thinking_ms.or_else(|| {
        match (turn.thinking_started_at, turn.thinking_ended_at, live) {
            (Some(start), Some(end), false) => Some(elapsed_ms(start, end)),
            (Some(start), _, true) => Some(elapsed_ms(start, now)),
            _ => None,
        }
    });
    TurnTiming {
        worked_ms,
        thinking_ms,
        completed_at,
        usage: turn.usage.clone(),
    }
}

pub fn parse_session_usage(value: &serde_json::Value) -> Option<SessionUsage> {
    let mut used = json_u64(value, &["used"]);
    let mut size = json_u64(value, &["size"]);
    // Claude ACP often sends `used`/`size` as null; the stdio normalizer coerces
    // those to 0 so the SDK can parse. A real empty window after compaction still
    // has a positive `size`.
    if used == Some(0) && size == Some(0) {
        used = None;
        size = None;
    }
    let cost_value = value.get("cost");
    let amount = cost_value.and_then(|cost| json_f64(cost, &["amount"]));
    let currency = cost_value.and_then(|cost| {
        cost.get("currency")
            .and_then(|item| item.as_str())
            .map(ToOwned::to_owned)
    });
    if used.is_none() && size.is_none() && amount.is_none() {
        return None;
    }
    Some(SessionUsage {
        used,
        size,
        cost: if amount.is_some() || currency.is_some() {
            Some(SessionCost { amount, currency })
        } else {
            None
        },
    })
}

pub fn merge_session_usage(existing: Option<SessionUsage>, incoming: SessionUsage) -> SessionUsage {
    let prev = existing.unwrap_or_default();
    SessionUsage {
        used: incoming.used.or(prev.used),
        size: incoming.size.or(prev.size),
        cost: incoming.cost.or(prev.cost),
    }
}

pub fn parse_turn_usage(value: &serde_json::Value) -> Option<TurnUsage> {
    turn_usage_from_object(value).or_else(|| value.get("usage").and_then(turn_usage_from_object))
}

fn turn_usage_from_object(value: &serde_json::Value) -> Option<TurnUsage> {
    let usage = TurnUsage {
        total_tokens: json_u64(value, &["total_tokens", "totalTokens"]),
        input_tokens: json_u64(value, &["input_tokens", "inputTokens"]),
        output_tokens: json_u64(value, &["output_tokens", "outputTokens"]),
        thought_tokens: json_u64(value, &["thought_tokens", "thoughtTokens"]),
        cached_read_tokens: json_u64(value, &["cached_read_tokens", "cachedReadTokens"]),
        cached_write_tokens: json_u64(value, &["cached_write_tokens", "cachedWriteTokens"]),
    };
    if usage.total_tokens.is_none()
        && usage.input_tokens.is_none()
        && usage.output_tokens.is_none()
        && usage.thought_tokens.is_none()
        && usage.cached_read_tokens.is_none()
        && usage.cached_write_tokens.is_none()
    {
        return None;
    }
    Some(usage)
}

fn json_u64(value: &serde_json::Value, keys: &[&str]) -> Option<u64> {
    for key in keys {
        if let Some(item) = value.get(*key) {
            if let Some(number) = item.as_u64() {
                return Some(number);
            }
            if let Some(number) = item.as_f64() {
                return Some(number.max(0.0) as u64);
            }
        }
    }
    None
}

fn json_f64(value: &serde_json::Value, keys: &[&str]) -> Option<f64> {
    for key in keys {
        if let Some(number) = value.get(*key).and_then(|item| item.as_f64()) {
            return Some(number);
        }
    }
    None
}

fn apply_turn_timing(message: &mut FoldedMessage, timing: &TurnTiming) {
    if message.role != "assistant" {
        return;
    }
    message.worked_ms = timing.worked_ms;
    message.thinking_ms = timing.thinking_ms;
    message.completed_at = timing.completed_at;
    if timing.usage.is_some() {
        message.usage = timing.usage.clone();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptEnvelope {
    pub event_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub event: TranscriptEvent,
}

impl TranscriptEnvelope {
    pub fn new(turn_id: impl Into<String>, event: TranscriptEvent) -> Self {
        Self::at(turn_id, Utc::now(), event)
    }

    pub fn at(
        turn_id: impl Into<String>,
        timestamp: DateTime<Utc>,
        event: TranscriptEvent,
    ) -> Self {
        Self {
            event_id: uuid::Uuid::new_v4().to_string(),
            turn_id: Some(turn_id.into()),
            timestamp,
            event,
        }
    }

    pub fn with_id(
        event_id: impl Into<String>,
        turn_id: impl Into<String>,
        event: TranscriptEvent,
    ) -> Self {
        Self {
            event_id: event_id.into(),
            turn_id: Some(turn_id.into()),
            timestamp: Utc::now(),
            event,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TranscriptEvent {
    TurnStarted,
    UserMessage {
        message_id: String,
        kind: UserMessageKind,
        text: String,
        #[serde(default)]
        attachments: Vec<String>,
    },
    UserCheckpoint {
        checkpoint_id: String,
    },
    AssistantSnapshot {
        message_id: String,
        text: String,
    },
    ThinkingSnapshot {
        message_id: String,
        text: String,
        #[serde(default)]
        started_at: Option<DateTime<Utc>>,
        #[serde(default)]
        duration_ms: Option<u64>,
    },
    ToolCall {
        tool: AgentTool,
    },
    Plan {
        plan: serde_json::Value,
    },
    Permission {
        request: PendingPermission,
    },
    TurnCompleted {
        status: TurnStatus,
        #[serde(default)]
        error: Option<String>,
        #[serde(default)]
        worked_ms: Option<u64>,
        #[serde(default)]
        thinking_ms: Option<u64>,
        #[serde(default)]
        usage: Option<TurnUsage>,
    },
    Usage {
        usage: serde_json::Value,
    },
    SessionLifecycle {
        message_id: String,
        action: SessionLifecycleAction,
        status: SessionLifecycleStatus,
        #[serde(default)]
        duration_ms: Option<u64>,
        #[serde(default)]
        error: Option<String>,
    },
    SessionConfigChange {
        message_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<SessionConfigValueChange>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        mode: Option<SessionConfigValueChange>,
    },
    SessionHint {
        message_id: String,
        tone: SessionHintTone,
        kind: String,
    },
    Unknown {
        event_type: String,
        payload: serde_json::Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentChatEvent {
    pub chat_id: String,
    pub event_id: String,
    pub sequence: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub payload: AgentChatPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentChatPayload {
    TurnStarted {
        turn_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        created_at: Option<DateTime<Utc>>,
    },
    UserMessage {
        turn_id: String,
        message_id: String,
        kind: UserMessageKind,
        text: String,
        #[serde(default)]
        attachments: Vec<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        created_at: Option<DateTime<Utc>>,
    },
    AssistantMessageDelta {
        message_id: String,
        delta: String,
    },
    AssistantMessageCompleted {
        message_id: String,
    },
    ThinkingDelta {
        message_id: String,
        delta: String,
    },
    ThinkingCompleted {
        message_id: String,
        #[serde(default)]
        thinking_ms: Option<u64>,
    },
    ToolCallStarted {
        tool_call: AgentTool,
    },
    ToolCallUpdated {
        tool_call: AgentTool,
    },
    ToolCallCompleted {
        tool_call: AgentTool,
    },
    ToolCallFailed {
        tool_call: AgentTool,
        #[serde(default)]
        error: Option<String>,
    },
    PlanUpdated {
        plan: serde_json::Value,
    },
    PermissionRequested {
        request: PendingPermission,
    },
    PermissionResolved {
        request_id: String,
        option_id: String,
    },
    SessionOpRequested {
        request: AgentSessionOpRequest,
    },
    SessionOpResolved {
        request_id: String,
        option_id: String,
        outcome: AgentChatSessionOpOutcome,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    SessionForked {
        parent_chat_id: String,
        chat_id: String,
    },
    RewindViewUpdated {
        until_turn_id: Option<String>,
    },
    TurnCompleted {
        turn_id: String,
        status: TurnStatus,
        #[serde(default)]
        worked_ms: Option<u64>,
        #[serde(default)]
        thinking_ms: Option<u64>,
        #[serde(default)]
        completed_at: Option<DateTime<Utc>>,
        #[serde(default)]
        usage: Option<TurnUsage>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    UsageUpdated {
        session: Option<SessionUsage>,
        turn: Option<TurnUsage>,
    },
    QueueUpdated {
        items: Vec<QueueItem>,
    },
    RuntimeStatus {
        status: RuntimeStatus,
        #[serde(default)]
        persistence_handle: Option<String>,
    },
    TitleUpdated {
        title: Option<String>,
    },
    AvailableCommandsUpdated {
        commands: Vec<agent::AgentAvailableCommand>,
    },
    ConfigUpdated {
        descriptor: AgentDescriptor,
    },
    Unknown {
        event_type: String,
        payload: serde_json::Value,
    },
    SessionLifecycle {
        turn_id: String,
        message_id: String,
        action: SessionLifecycleAction,
        status: SessionLifecycleStatus,
        #[serde(default)]
        duration_ms: Option<u64>,
        #[serde(default)]
        error: Option<String>,
    },
    SessionConfigChange {
        turn_id: String,
        message_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<SessionConfigValueChange>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        mode: Option<SessionConfigValueChange>,
    },
    SessionHint {
        turn_id: String,
        message_id: String,
        tone: SessionHintTone,
        kind: String,
    },
}

#[derive(Debug, Clone)]
pub struct CreateAgentChatRequest {
    pub workspace_id: Option<String>,
    pub project_id: Option<String>,
    pub space_id: Option<String>,
    pub cwd: String,
    pub origin: AgentChatOrigin,
    pub provider_id: String,
    pub model: Option<String>,
    pub thinking: Option<String>,
    pub mode: Option<String>,
    pub title: Option<String>,
}

#[cfg(test)]
mod usage_parse_tests {
    use serde_json::json;

    use super::{merge_session_usage, parse_session_usage, parse_turn_usage, SessionUsage};

    #[test]
    fn coerced_zero_window_is_not_session_usage() {
        assert!(parse_session_usage(&json!({ "used": 0, "size": 0 })).is_none());
    }

    #[test]
    fn cost_only_usage_update_parses() {
        let parsed = parse_session_usage(&json!({
            "used": 0,
            "size": 0,
            "cost": { "amount": 0.045, "currency": "USD" }
        }))
        .expect("cost");
        assert!(parsed.used.is_none());
        assert!(parsed.size.is_none());
        assert_eq!(
            parsed.cost.as_ref().and_then(|cost| cost.amount),
            Some(0.045)
        );
    }

    #[test]
    fn real_context_window_parses_including_compaction_zero() {
        let parsed = parse_session_usage(&json!({ "used": 0, "size": 200000 })).expect("window");
        assert_eq!(parsed.used, Some(0));
        assert_eq!(parsed.size, Some(200_000));
    }

    #[test]
    fn merge_keeps_previous_window_when_only_cost_arrives() {
        let existing = SessionUsage {
            used: Some(12_000),
            size: Some(200_000),
            cost: None,
        };
        let incoming = parse_session_usage(&json!({
            "cost": { "amount": 0.12, "currency": "USD" }
        }))
        .unwrap();
        let merged = merge_session_usage(Some(existing), incoming);
        assert_eq!(merged.used, Some(12_000));
        assert_eq!(merged.size, Some(200_000));
        assert_eq!(
            merged.cost.as_ref().and_then(|cost| cost.amount),
            Some(0.12)
        );
    }

    #[test]
    fn prompt_response_camel_case_usage_parses_as_turn() {
        let parsed = parse_turn_usage(&json!({
            "totalTokens": 150,
            "inputTokens": 100,
            "outputTokens": 40,
            "thoughtTokens": 10,
            "cachedReadTokens": 20,
            "cachedWriteTokens": 5
        }))
        .expect("turn");
        assert_eq!(parsed.total_tokens, Some(150));
        assert_eq!(parsed.input_tokens, Some(100));
        assert_eq!(parsed.output_tokens, Some(40));
        assert_eq!(parsed.thought_tokens, Some(10));
        assert_eq!(parsed.cached_read_tokens, Some(20));
        assert_eq!(parsed.cached_write_tokens, Some(5));
        assert!(parse_session_usage(&json!({
            "totalTokens": 150,
            "inputTokens": 100,
            "outputTokens": 40
        }))
        .is_none());
    }

    #[test]
    fn nested_usage_object_parses_as_turn() {
        let parsed = parse_turn_usage(&json!({
            "stopReason": "end_turn",
            "usage": { "total_tokens": 12, "input_tokens": 8, "output_tokens": 4 }
        }))
        .expect("nested");
        assert_eq!(parsed.total_tokens, Some(12));
        assert_eq!(parsed.input_tokens, Some(8));
        assert_eq!(parsed.output_tokens, Some(4));
    }
}

#[cfg(test)]
mod session_config_change_tests {
    use super::{
        config_kind_matches, merge_advertised_options, pending_session_config_change,
        resolve_session_config_select, AgentChatMeta, AgentChatOrigin, AgentCurrentConfig,
        ResolvedSessionConfig, RuntimeStatus, SessionAdvertisedOption,
        SessionAdvertisedOptionValue,
    };
    use agent::AgentModel;
    use chrono::Utc;

    fn meta() -> AgentChatMeta {
        AgentChatMeta {
            id: "chat-1".into(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            deleted: false,
            title: None,
            cwd: "/tmp".into(),
            workspace_id: None,
            project_id: None,
            space_id: None,
            origin: AgentChatOrigin::Normal,
            provider_id: "claude".into(),
            last_message_at: None,
            last_event_seq: 0,
            persistence_handle: None,
            runtime_status: RuntimeStatus::Ready,
            applied_model: None,
            applied_thinking: None,
            applied_mode: None,
            applied_permission_mode: None,
            available_commands: Vec::new(),
            session_usage: None,
            descriptor: super::chat_descriptor(
                "claude",
                AgentCurrentConfig {
                    model: Some("opus".into()),
                    thinking: None,
                    mode: None,
                    ..AgentCurrentConfig::default()
                },
            ),
            parent_chat_id: None,
            rewind_view: None,
            pending_session_op: None,
        }
    }

    #[test]
    fn first_session_is_not_a_switch() {
        assert!(pending_session_config_change(&meta()).is_none());
    }

    #[test]
    fn first_mode_after_session_started_is_a_switch() {
        let mut row = meta();
        row.applied_model = Some("opus".into());
        row.descriptor.current_config.mode = Some("plan".into());
        let change = pending_session_config_change(&row).expect("change");
        assert!(change.model.is_none());
        assert_eq!(
            change.mode.as_ref().map(|item| item.to.as_str()),
            Some("plan")
        );
        assert!(change
            .mode
            .as_ref()
            .and_then(|item| item.from.as_deref())
            .is_none());
    }

    #[test]
    fn model_and_mode_switch_after_apply() {
        let mut row = meta();
        row.applied_model = Some("opus".into());
        row.descriptor.current_config.model = Some("grok-4".into());
        row.applied_mode = Some("agent".into());
        row.descriptor.current_config.mode = Some("plan".into());
        let change = pending_session_config_change(&row).expect("change");
        assert_eq!(
            change.model.as_ref().map(|item| item.to.as_str()),
            Some("grok-4")
        );
        assert_eq!(
            change.model.as_ref().and_then(|item| item.from.as_deref()),
            Some("opus")
        );
        assert_eq!(
            change.mode.as_ref().map(|item| item.to.as_str()),
            Some("plan")
        );
    }

    #[test]
    fn unchanged_selection_is_not_a_switch() {
        let mut row = meta();
        row.applied_model = Some("opus".into());
        row.descriptor.current_config.model = Some("opus".into());
        assert!(pending_session_config_change(&row).is_none());
    }

    fn model_option(id: &str, values: &[&str]) -> SessionAdvertisedOption {
        SessionAdvertisedOption {
            id: id.into(),
            name: None,
            category: Some("model".into()),
            option_type: "select".into(),
            current_value: values.first().map(|value| (*value).to_string()),
            options: values
                .iter()
                .map(|value| SessionAdvertisedOptionValue {
                    value: (*value).into(),
                    name: None,
                })
                .collect(),
        }
    }

    #[test]
    fn unknown_options_pass_the_requested_value_through() {
        assert_eq!(
            resolve_session_config_select(&meta(), "model", "opus"),
            ResolvedSessionConfig::PassThrough("opus".into())
        );
    }

    #[test]
    fn advertised_select_maps_to_the_listed_value() {
        let mut row = meta();
        let values = ["claude-opus-4-5", "claude-fable-5-high"];
        row.descriptor.supported_options.models = values
            .iter()
            .map(|value| AgentModel {
                id: (*value).into(),
                label: (*value).into(),
                group: None,
                is_default: false,
                thinking: None,
            })
            .collect();
        assert_eq!(
            resolve_session_config_select(&row, "model", "claude-fable-5-high"),
            ResolvedSessionConfig::PassThrough("claude-fable-5-high".into())
        );
        assert_eq!(
            resolve_session_config_select(&row, "model", "claude-fable-5"),
            ResolvedSessionConfig::PassThrough("claude-fable-5-high".into())
        );
        assert_eq!(
            resolve_session_config_select(&row, "model", "grok-4"),
            ResolvedSessionConfig::PassThrough("grok-4".into())
        );
        assert_eq!(
            resolve_session_config_select(&row, "mode", "plan"),
            ResolvedSessionConfig::PassThrough("plan".into())
        );
    }

    #[test]
    fn permission_mode_aliases_do_not_match_agent_mode() {
        assert!(config_kind_matches(
            "permissionMode",
            None,
            "permission_mode"
        ));
        assert!(config_kind_matches(
            "permission_modes",
            None,
            "permission_mode"
        ));
        assert!(config_kind_matches(
            "approval",
            Some("permission"),
            "permission_mode"
        ));
        assert!(!config_kind_matches("permission_mode", None, "mode"));
        assert!(!config_kind_matches("mode", None, "permission_mode"));
    }

    #[test]
    fn complete_config_snapshot_replaces_previous_options() {
        let prev = vec![model_option("model", &["opus"])];
        let incoming = vec![
            model_option("models", &["opus", "grok-4"]),
            SessionAdvertisedOption {
                id: "mode".into(),
                name: None,
                category: Some("mode".into()),
                option_type: "select".into(),
                current_value: Some("ask".into()),
                options: vec![SessionAdvertisedOptionValue {
                    value: "ask".into(),
                    name: None,
                }],
            },
        ];
        let merged = merge_advertised_options(prev, incoming.clone());
        assert_eq!(merged, incoming);
    }

    #[test]
    fn current_value_only_update_keeps_existing_options() {
        let prev = vec![model_option("model", &["opus", "grok-4"])];
        let incoming = vec![SessionAdvertisedOption {
            id: "model".into(),
            name: None,
            category: Some("model".into()),
            option_type: "select".into(),
            current_value: Some("grok-4".into()),
            options: Vec::new(),
        }];
        let merged = merge_advertised_options(prev, incoming);
        assert_eq!(merged[0].current_value.as_deref(), Some("grok-4"));
        assert_eq!(merged[0].options.len(), 2);
    }
}
