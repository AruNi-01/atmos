pub mod acp_client;
pub mod catalog;
pub mod domain;
pub mod manager;
pub mod models;
pub mod providers;

#[cfg(any(test, feature = "test-support"))]
pub mod testing;

pub use acp_client::{
    list_acp_sessions, logout_acp_agent, run_acp_session, AcpSessionControl, AcpSessionEvent,
    AcpSessionHandle, AcpToolHandler, AgentCapabilitiesSnapshot, AgentCapabilityState,
    AgentImplementationInfo, AgentLogoutResult, AgentSessionInfoUpdate, AtmosAcpClient,
    NativeAgentSession, NativeAgentSessionList, PermissionRequest, PermissionResponse, RiskLevel,
    StreamDelta, StreamUsage, ToolCallStatus, ToolCallUpdate, AUTH_REQUIRED_ERROR_PREFIX,
};
pub use catalog::{
    catalog_cache_dir, merge_catalogs, parse_droid_help, parse_line_list,
    probe_result_from_config_options, thinking_from_builtin, AcpCatalogProbe, AcpLaunchResolved,
    AcpLaunchResolver, AcpProbeResult, AgentCatalogSpec, CatalogCache, CatalogEngine,
    CatalogFragment, CatalogParserKind, CommandOutput, CommandRunner, NoopAcpProbe,
    StdioAcpCatalogProbe, ERROR_CACHE_TTL, OK_CACHE_TTL,
};
pub use domain::{
    classify_tool, deserialize_tool_kind, is_generic_tool_label, plan_from_tool_input,
    thinking_text, AgentAvailableCommand, AgentCapabilities, AgentCatalogContext, AgentEvent,
    AgentMode, AgentModel, AgentModelCatalog, AgentPermissionOption, AgentPermissionRequest,
    AgentPersistenceHandle, AgentPrompt, AgentProvider, AgentProviderError, AgentProviderFactory,
    AgentResult, AgentRuntime, AgentRuntimeConfig, AgentRuntimeConfigUpdate, AgentRuntimeControl,
    AgentThinkingSupport, AgentToolCall, AgentToolKind, AgentTurnHandle, CatalogSource,
    CatalogStatus, CatalogStrategyKind, ClassifiedTool, TurnStop, UserMessageKind,
};
pub use manager::AgentManager;
pub use models::{
    AgentConfigState, AgentId, AgentInstallResult, AgentLaunchSpec, AgentStatus, CustomAgent,
    KnownAgent, RegistryAgent, RegistryInstallResult,
};
pub use providers::acp::{AcpAgentProvider, AcpProviderParams};
