use std::sync::Arc;
use std::time::Duration;

use thiserror::Error;

/// Stable product job identifier (e.g. `automation.schedule_tick`).
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct JobId(pub Arc<str>);

impl JobId {
    pub fn new(id: impl AsRef<str>) -> Self {
        Self(Arc::from(id.as_ref()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for JobId {
    fn from(value: &str) -> Self {
        Self::new(value)
    }
}

impl From<String> for JobId {
    fn from(value: String) -> Self {
        Self::new(value)
    }
}

impl std::fmt::Display for JobId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Interval schedule for a local job.
#[derive(Clone, Debug)]
pub struct IntervalSpec {
    pub every: Duration,
    /// When true, skip starting a new run if the previous firing is still in flight.
    pub skip_if_running: bool,
    /// When true, run soon after registration; when false, wait one full period first.
    pub fire_immediately: bool,
}

impl IntervalSpec {
    pub fn every(every: Duration) -> Self {
        Self {
            every,
            skip_if_running: true,
            fire_immediately: false,
        }
    }
}

/// Per-firing retry policy (max_attempts = 1 means no extra retries).
#[derive(Clone, Debug)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub initial_delay: Duration,
    pub max_delay: Duration,
    pub multiplier: f64,
}

impl RetryPolicy {
    pub fn none() -> Self {
        Self {
            max_attempts: 1,
            initial_delay: Duration::from_millis(0),
            max_delay: Duration::from_millis(0),
            multiplier: 1.0,
        }
    }

    pub fn exponential(max_attempts: u32, initial_delay: Duration, max_delay: Duration) -> Self {
        Self {
            max_attempts: max_attempts.max(1),
            initial_delay,
            max_delay,
            multiplier: 2.0,
        }
    }
}

/// Result of a single job firing attempt.
#[derive(Debug, Error)]
pub enum JobError {
    #[error("retryable job error: {0}")]
    Retryable(String),
    #[error("fatal job error: {0}")]
    Fatal(String),
}

pub type JobResult = Result<(), JobError>;

#[derive(Debug, Error)]
pub enum JobsError {
    #[error("jobs runtime is shutting down")]
    ShuttingDown,
    #[error("job not registered: {0}")]
    NotRegistered(String),
    #[error("invalid job interval: duration must be non-zero")]
    InvalidInterval,
    #[error("jobs internal error: {0}")]
    Internal(String),
}
