//! Local-first event queue (APP-051).
//!
//! External/event-driven work enqueues here; consumers run business handlers.
//! Interactive user actions must not use this path (call services directly).
//!
//! Adapters:
//! - [`LocalMemoryQueue`] — process-local, droppable (`tokio::sync::mpsc`)
//! - [`LocalPersistentQueue`] — SQLite durable, for third-party triggers

mod local;
mod persistent;
mod types;

pub use local::{LocalMemoryQueue, LocalMemoryQueueBuilder};
pub use persistent::LocalPersistentQueue;
pub use types::{topics, EnqueueError, QueueError, QueueMessage, Topic};
