use crate::error::Result;

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
