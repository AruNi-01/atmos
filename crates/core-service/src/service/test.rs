use std::sync::Arc;

use core_engine::TestEngine;
use infra::TestMessageRepo;
use sea_orm::DatabaseConnection;

use crate::error::{Result, ServiceError};

pub struct TestService {
    engine: Arc<TestEngine>,
    db: DatabaseConnection,
}

impl TestService {
    pub fn new(engine: Arc<TestEngine>, db: DatabaseConnection) -> Self {
        Self { engine, db }
    }

    pub async fn process_hello(&self, message: &str) -> Result<String> {
        tracing::info!("[CoreService] Processing: {message}");

        let result = self.engine.process(message)?;

        let repo = TestMessageRepo::new(&self.db);
        repo.save_message(message)
            .await
            .map_err(|e| ServiceError::Repository(e.to_string()))?;

        Ok(result)
    }
}
