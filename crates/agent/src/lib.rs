pub mod acp_client;
pub mod manager;
pub mod models;

pub use acp_client::{
    run_acp_session, AcpSessionEvent, AcpSessionHandle, AcpToolHandler, AtmosAcpClient,
    PermissionRequest, PermissionResponse, RiskLevel, StreamDelta, StreamUsage, ToolCallStatus,
    ToolCallUpdate, AUTH_REQUIRED_ERROR_PREFIX,
};
pub use manager::AgentManager;
pub use models::{
    AgentConfigState, AgentId, AgentInstallResult, AgentLaunchSpec, AgentStatus, CustomAgent,
    KnownAgent, RegistryAgent, RegistryInstallResult,
};
