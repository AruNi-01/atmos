//! Local-first event queue (APP-051).
//!
//! External/event-driven work enqueues here; consumers run business handlers.
//! Interactive user actions must not use this path (call services directly).
//!
//! v1 adapter: [`LocalMemoryQueue`] (`tokio::sync::mpsc`, bounded). Not a message broker.

mod local;
mod types;

pub use local::{LocalMemoryQueue, LocalMemoryQueueBuilder};
pub use types::{topics, EnqueueError, QueueError, QueueMessage, Topic};
