//! ACP client module - ACP protocol implementation and Agent process management.

pub mod client;
pub mod logging;
pub mod process;
pub mod runner;
pub mod tools;
pub mod types;

pub use client::{AcpSessionEvent, AtmosAcpClient};
pub use process::spawn_agent;
pub use runner::{
    list_acp_sessions, logout_acp_agent, run_acp_session, AcpSessionControl, AcpSessionHandle,
    AUTH_REQUIRED_ERROR_PREFIX,
};
pub use tools::AcpToolHandler;
pub use types::{
    AgentCapabilitiesSnapshot, AgentCapabilityState, AgentImplementationInfo, AgentLogoutResult,
    AgentSessionInfoUpdate, AuthMethodSummary, AuthRequiredPayload, NativeAgentSession,
    NativeAgentSessionList, PermissionRequest, PermissionResponse, RiskLevel, StreamDelta,
    StreamUsage, ToolCallStatus, ToolCallUpdate,
};
