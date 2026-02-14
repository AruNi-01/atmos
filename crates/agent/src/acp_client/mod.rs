//! ACP client module - ACP protocol implementation and Agent process management.

pub mod client;
pub mod process;
pub mod runner;
pub mod tools;
pub mod types;

pub use client::{AcpSessionEvent, AtmosAcpClient};
pub use process::spawn_agent;
pub use runner::{run_acp_session, AcpSessionHandle};
pub use tools::AcpToolHandler;
pub use types::{
    PermissionRequest, PermissionResponse, RiskLevel, StreamDelta, StreamUsage, ToolCallStatus,
    ToolCallUpdate,
};
