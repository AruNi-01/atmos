pub mod acp_client;
pub(crate) mod contract;
pub mod manager;
pub(crate) mod map;
pub mod models;
pub mod options;
pub(crate) mod policy;
pub mod providers;

#[cfg(any(test, feature = "test-support"))]
pub mod testing;

pub use contract::{
    AgentAction, AgentActionError, AgentActionKind, AgentActionResult, AgentAvailableCommand,
    AgentCapabilities, AgentCheckpoint, AgentCurrentConfig, AgentDescriptor, AgentEvent,
    AgentEventEnvelope, AgentIdentity, AgentMode, AgentModel, AgentOptionSupport,
    AgentOptionsContext, AgentPermissionOption, AgentPermissionRequest, AgentPersistenceHandle,
    AgentPrompt, AgentProvider, AgentProviderError, AgentProviderFactory, AgentResult,
    AgentRuntime, AgentRuntimeConfig, AgentRuntimeConfigUpdate, AgentRuntimeControl,
    AgentSessionOpRequest, AgentSupportedOptions, AgentThinkingSupport, AgentTool, AgentToolCall,
    AgentToolKind, AgentToolParams, AgentToolResult, AgentToolStatus, AgentTurnHandle, Capability,
    SearchHit, SessionOpKind, SessionOpOutcome, TurnStop, UserMessageKind, WebSearchLink,
};
pub use manager::AgentManager;
pub use manager::{
    is_builtin_custom_agent_id, is_native_chat_agent_id, looks_like_missing_llm_api_key,
    native_chat_launch_spec, DEEPSEEK_API_KEY_ENV, DEEPSEEK_HARNESS_ID,
};
pub use models::{
    AgentConfigState, AgentId, AgentInstallResult, AgentLaunchSpec, AgentStatus, CustomAgent,
    KnownAgent, NativeChatAgent, RegistryAgent, RegistryInstallResult,
};
pub use options::{
    apply_grok_thinking_overlay, apply_native_chat_options_plan,
    apply_options_defaults_to_current_config, apply_options_to_descriptor,
    collapse_cursor_cli_models, cursor_model_base, cursor_model_display_label,
    cursor_model_has_brackets, fill_cursor_thinking_by_base, grok_thinking_for_model_id,
    is_native_chat_options_id, map_to_advertised_cursor_model, merge_options_snapshots,
    model_id_is_table_noise, models_look_like_cursor_acp, options_cache_dir, parse_droid_help,
    parse_line_list, probe_result_from_config_options, rebuild_descriptor_for_provider,
    supported_options_from_snapshot, thinking_from_builtin, AcpLaunchResolved, AcpLaunchResolver,
    AcpOptionsProbe, AcpOptionsProbeResult, AgentOptionsSnapshot, CommandOutput, CommandRunner,
    NativeOptionsProbe, NativeOptionsProbeResult, NoopAcpOptionsProbe, NoopNativeOptionsProbe,
    OptionsCache, OptionsFragment, OptionsParserKind, OptionsProbe, OptionsProbeStrategy,
    OptionsSource, OptionsStatus, ProbePlan, ProcessCommandRunner, StdioAcpOptionsProbe,
    ERROR_CACHE_TTL, OK_CACHE_TTL,
};
pub use policy::{
    canonicalize_chat_provider_id, capabilities_for_provider, is_plan_mode,
    normalize_stored_permission, option_support_for_provider,
};
pub use providers::acp::{AcpAgentProvider, AcpProviderParams};
pub use providers::claude::ClaudeNativeProvider;
pub use providers::codex::CodexNativeProvider;
pub use providers::opencode::OpenCodeNativeProvider;
pub use providers::pi::PiNativeProvider;
