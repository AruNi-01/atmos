use std::sync::Arc;

use chrono::{DateTime, Utc};
use thiserror::Error;

/// Named queue topic (e.g. `automation.github_delivery`).
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Topic(pub Arc<str>);

impl Topic {
    pub fn new(name: impl AsRef<str>) -> Self {
        Self(Arc::from(name.as_ref()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for Topic {
    fn from(value: &str) -> Self {
        Self::new(value)
    }
}

impl From<String> for Topic {
    fn from(value: String) -> Self {
        Self::new(value)
    }
}

impl std::fmt::Display for Topic {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Opaque queue message delivered to a consumer.
#[derive(Clone, Debug)]
pub struct QueueMessage {
    pub id: String,
    pub payload: Vec<u8>,
    pub enqueued_at: DateTime<Utc>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum EnqueueError {
    #[error("queue is full")]
    Full,
    #[error("queue is shutting down")]
    ShuttingDown,
    #[error("no consumer subscribed for topic")]
    NoConsumer,
}

#[derive(Debug, Error)]
pub enum QueueError {
    #[error("queue is shutting down")]
    ShuttingDown,
    #[error("topic already has a consumer: {0}")]
    ConsumerExists(String),
    #[error("queue consumer error: {0}")]
    Handler(String),
    #[error("queue internal error: {0}")]
    Internal(String),
}

/// Well-known product topics (APP-051 catalog).
pub mod topics {
    pub const AUTOMATION_GITHUB_DELIVERY: &str = "automation.github_delivery";
}
