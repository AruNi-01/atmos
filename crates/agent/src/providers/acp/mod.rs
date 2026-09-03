//! ACP provider adapter. This is the only module that maps ACP protocol
//! types onto the host `AgentEvent` / `AgentRuntime` surface.
//!
//! Pipeline: protocol kind → generic extractors → optional `provider_id` overlay.

mod adapter;
mod event_map;
mod overlays;
mod tool_map;

pub use adapter::{AcpAgentProvider, AcpProviderParams};
