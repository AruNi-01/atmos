use std::path::Path;

use async_trait::async_trait;

use crate::policy::canonicalize_chat_provider_id;

use super::engine::{NativeCatalogProbe, NativeProbeResult};

/// Dispatches Chat native catalog probes. Grok stdio probe is slash-only;
/// models still come from `grok models` CLI.
pub struct DispatchNativeCatalogProbe;

#[async_trait]
impl NativeCatalogProbe for DispatchNativeCatalogProbe {
    async fn probe(
        &self,
        agent_id: &str,
        isolated_cwd: &Path,
    ) -> Result<NativeProbeResult, String> {
        std::fs::create_dir_all(isolated_cwd).map_err(|error| error.to_string())?;
        match canonicalize_chat_provider_id(agent_id) {
            "claude" => crate::providers::claude::catalog::probe(isolated_cwd).await,
            "codex" => crate::providers::codex::catalog::probe(isolated_cwd).await,
            "opencode" => crate::providers::opencode::catalog::probe(isolated_cwd).await,
            "pi" => crate::providers::pi::catalog::probe(isolated_cwd).await,
            "grok" => crate::providers::grok::catalog::probe(isolated_cwd).await,
            _ => Err(format!("no native catalog probe for {agent_id}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn custom_ids_are_not_native_probed() {
        let dir = tempfile::tempdir().unwrap();
        let error = DispatchNativeCatalogProbe
            .probe("grok-build", dir.path())
            .await
            .expect_err("stay ACP");
        assert!(error.contains("grok-build"));
    }
}
