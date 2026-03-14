use crate::error::Result;

/// Development/integration utility used by core-service's TestService and the API layer.
/// Provides a simple echo-style processor for verifying the engine ↔ service wiring.
pub struct TestEngine;

impl TestEngine {
    pub fn new() -> Self {
        Self
    }

    pub fn process(&self, message: &str) -> Result<String> {
        tracing::info!("[CoreEngine] Processing message: {message}");
        Ok(format!("Processed: {message}"))
    }
}

impl Default for TestEngine {
    fn default() -> Self {
        Self::new()
    }
}
