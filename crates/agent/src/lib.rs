pub mod acp_client;
pub mod catalog;
pub(crate) mod contract;
pub mod manager;
pub(crate) mod map;
pub mod models;
pub(crate) mod policy;
pub mod providers;

#[cfg(any(test, feature = "test-support"))]
pub mod testing;

pub use catalog::{
    apply_catalog_defaults_to_current_config, apply_catalog_to_descriptor,
    apply_grok_thinking_overlay, apply_native_chat_catalog_spec, catalog_cache_dir,
    grok_thinking_for_model_id, is_native_chat_catalog_id, merge_catalogs, parse_droid_help,
    parse_line_list, probe_result_from_config_options, rebuild_descriptor_for_provider,
    supported_options_from_catalog, thinking_from_builtin, AcpCatalogProbe, AcpLaunchResolved,
    AcpLaunchResolver, AcpProbeResult, AgentCatalogSpec, AgentModelCatalog, CatalogCache,
    CatalogEngine, CatalogFragment, CatalogParserKind, CatalogSource, CatalogStatus,
    CatalogStrategyKind, CommandOutput, CommandRunner, NativeCatalogProbe, NativeProbeResult,
    NoopAcpProbe, NoopNativeProbe, StdioAcpCatalogProbe, ERROR_CACHE_TTL, OK_CACHE_TTL,
};
pub use contract::{
    AgentAction, AgentActionError, AgentActionKind, AgentActionResult, AgentAvailableCommand,
    AgentCapabilities, AgentCatalogContext, AgentCheckpoint, AgentCurrentConfig, AgentDescriptor,
    AgentEvent, AgentEventEnvelope, AgentIdentity, AgentMode, AgentModel, AgentOptionSupport,
    AgentPermissionOption, AgentPermissionRequest, AgentPersistenceHandle, AgentPrompt,
    AgentProvider, AgentProviderError, AgentProviderFactory, AgentResult, AgentRuntime,
    AgentRuntimeConfig, AgentRuntimeConfigUpdate, AgentRuntimeControl, AgentSessionOpRequest,
    AgentSupportedOptions, AgentThinkingSupport, AgentTool, AgentToolCall, AgentToolKind,
    AgentToolParams, AgentToolResult, AgentToolStatus, AgentTurnHandle, Capability, SearchHit,
    SessionOpKind, SessionOpOutcome, TurnStop, UserMessageKind, WebSearchLink,
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
pub use policy::{
    canonicalize_chat_provider_id, capabilities_for_provider, is_plan_mode,
    normalize_stored_permission, option_support_for_provider,
};
pub use providers::acp::{AcpAgentProvider, AcpProviderParams};
pub use providers::claude::ClaudeNativeProvider;
pub use providers::codex::CodexNativeProvider;
pub use providers::opencode::OpenCodeNativeProvider;
pub use providers::pi::PiNativeProvider;
