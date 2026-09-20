//! Native options probe strategy.

use std::path::{Path, PathBuf};

use async_trait::async_trait;

use crate::contract::{AgentAvailableCommand, AgentThinkingSupport};
use crate::policy::canonicalize_chat_provider_id;

#[derive(Debug, Clone)]
pub struct NativeOptionsProbeResult {
    pub models: Vec<crate::contract::AgentModel>,
    pub modes: Vec<crate::contract::AgentMode>,
    pub permission_modes: Vec<crate::contract::AgentMode>,
    pub thinking: AgentThinkingSupport,
    pub commands: Vec<AgentAvailableCommand>,
    pub cwd: PathBuf,
    pub closed: bool,
}

#[async_trait]
pub trait NativeOptionsProbe: Send + Sync {
    async fn probe(
        &self,
        agent_id: &str,
        isolated_cwd: &Path,
    ) -> Result<NativeOptionsProbeResult, String>;
}

pub struct NoopNativeOptionsProbe;

#[async_trait]
impl NativeOptionsProbe for NoopNativeOptionsProbe {
    async fn probe(
        &self,
        _agent_id: &str,
        _isolated_cwd: &Path,
    ) -> Result<NativeOptionsProbeResult, String> {
        Err("native probe unavailable".into())
    }
}

/// Dispatches Chat native options probes. Grok stdio probe is slash-only;
/// models still come from `grok models` CLI.
pub struct DispatchNativeOptionsProbe;

#[async_trait]
impl NativeOptionsProbe for DispatchNativeOptionsProbe {
    async fn probe(
        &self,
        agent_id: &str,
        isolated_cwd: &Path,
    ) -> Result<NativeOptionsProbeResult, String> {
        std::fs::create_dir_all(isolated_cwd).map_err(|error| error.to_string())?;
        match canonicalize_chat_provider_id(agent_id) {
            "claude" => crate::providers::claude::options::probe(isolated_cwd).await,
            "codex" => crate::providers::codex::options::probe(isolated_cwd).await,
            "opencode" => crate::providers::opencode::options::probe(isolated_cwd).await,
            "pi" => crate::providers::pi::options::probe(isolated_cwd).await,
            "grok" => crate::providers::grok::options::probe(isolated_cwd).await,
            _ => Err(format!("no native options probe for {agent_id}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn custom_ids_are_not_native_probed() {
        let dir = tempfile::tempdir().unwrap();
        let error = DispatchNativeOptionsProbe
            .probe("grok-build", dir.path())
            .await
            .expect_err("stay ACP");
        assert!(error.contains("grok-build"));
    }
}
