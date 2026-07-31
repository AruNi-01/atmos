//! Local-first product job scheduler (APP-051).
//!
//! Time-driven work registers here. Business crates supply handlers; this module
//! owns timers, cancel/replace, optional per-firing retry, and shutdown.
//!
//! v1 adapter: [`LocalScheduler`] (Tokio). No distributed job engines.

mod local;
mod types;

pub use local::LocalScheduler;
pub use types::{
    IntervalSpec, JobError, JobId, JobResult, JobsError, RetryPolicy,
};
