//! ACP provider adapter. This is the only module that maps ACP protocol
//! types onto the host `AgentEvent` / `AgentSession` surface.

mod adapter;

pub use adapter::{AcpAgentProvider, AcpProviderParams};
