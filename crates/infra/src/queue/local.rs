use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use chrono::Utc;
use tokio::sync::{mpsc, Mutex};
use tokio::task::JoinHandle;
use tracing::{debug, warn};
use uuid::Uuid;

use super::types::{EnqueueError, QueueError, QueueMessage, Topic};

type DynHandler = Arc<
    dyn Fn(QueueMessage) -> std::pin::Pin<Box<dyn Future<Output = Result<(), QueueError>> + Send>>
        + Send
        + Sync,
>;

struct TopicState {
    tx: mpsc::Sender<QueueMessage>,
    consumer: JoinHandle<()>,
}

/// Process-local bounded in-memory queue (APP-051 LocalMemoryQueue).
///
/// Backed by `tokio::sync::mpsc` per topic. Full enqueue returns [`EnqueueError::Full`].
pub struct LocalMemoryQueue {
    capacity: usize,
    topics: Mutex<HashMap<Topic, TopicState>>,
    shutting_down: AtomicBool,
}

impl LocalMemoryQueue {
    pub fn builder() -> LocalMemoryQueueBuilder {
        LocalMemoryQueueBuilder { capacity: 128 }
    }

    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            topics: Mutex::new(HashMap::new()),
            shutting_down: AtomicBool::new(false),
        }
    }

    /// Enqueue a payload. Requires a subscribed consumer for the topic.
    pub async fn enqueue(&self, topic: &Topic, payload: Vec<u8>) -> Result<String, EnqueueError> {
        if self.shutting_down.load(Ordering::SeqCst) {
            return Err(EnqueueError::ShuttingDown);
        }

        let msg = QueueMessage {
            id: Uuid::new_v4().to_string(),
            payload,
            enqueued_at: Utc::now(),
        };
        let msg_id = msg.id.clone();

        let topics = self.topics.lock().await;
        let Some(state) = topics.get(topic) else {
            return Err(EnqueueError::NoConsumer);
        };

        match state.tx.try_send(msg) {
            Ok(()) => {
                debug!(topic = %topic, msg_id = %msg_id, "queue enqueued");
                Ok(msg_id)
            }
            Err(mpsc::error::TrySendError::Full(_)) => Err(EnqueueError::Full),
            Err(mpsc::error::TrySendError::Closed(_)) => Err(EnqueueError::ShuttingDown),
        }
    }

    /// Register a single consumer for `topic` (v1: one consumer per topic).
    pub async fn subscribe<F, Fut>(&self, topic: Topic, handler: F) -> Result<(), QueueError>
    where
        F: Fn(QueueMessage) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<(), QueueError>> + Send + 'static,
    {
        if self.shutting_down.load(Ordering::SeqCst) {
            return Err(QueueError::ShuttingDown);
        }

        let dyn_handler: DynHandler = Arc::new(move |msg| {
            let fut = handler(msg);
            Box::pin(fut) as std::pin::Pin<Box<dyn Future<Output = Result<(), QueueError>> + Send>>
        });

        let (tx, mut rx) = mpsc::channel::<QueueMessage>(self.capacity);
        let topic_for_task = topic.clone();
        let consumer = tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                let msg_id = msg.id.clone();
                if let Err(error) = dyn_handler(msg).await {
                    warn!(
                        topic = %topic_for_task,
                        msg_id = %msg_id,
                        error = %error,
                        "queue consumer handler failed; dropping message"
                    );
                }
            }
        });

        let mut topics = self.topics.lock().await;
        if topics.contains_key(&topic) {
            consumer.abort();
            return Err(QueueError::ConsumerExists(topic.as_str().to_string()));
        }
        topics.insert(topic, TopicState { tx, consumer });
        Ok(())
    }

    pub async fn shutdown(&self) -> Result<(), QueueError> {
        self.shutting_down.store(true, Ordering::SeqCst);
        let mut topics = self.topics.lock().await;
        for (_, state) in topics.drain() {
            drop(state.tx);
            state.consumer.abort();
        }
        Ok(())
    }
}

pub struct LocalMemoryQueueBuilder {
    capacity: usize,
}

impl LocalMemoryQueueBuilder {
    pub fn capacity(mut self, capacity: usize) -> Self {
        self.capacity = capacity.max(1);
        self
    }

    pub fn build(self) -> LocalMemoryQueue {
        LocalMemoryQueue::new(self.capacity)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    use tokio::sync::oneshot;

    #[tokio::test]
    async fn enqueue_and_consume() {
        let queue = LocalMemoryQueue::builder().capacity(8).build();
        let (tx, rx) = oneshot::channel::<Vec<u8>>();
        let tx = Arc::new(Mutex::new(Some(tx)));
        let topic = Topic::new("test.topic");

        let tx_handler = Arc::clone(&tx);
        queue
            .subscribe(topic.clone(), move |msg| {
                let tx_handler = Arc::clone(&tx_handler);
                async move {
                    if let Some(sender) = tx_handler.lock().await.take() {
                        let _ = sender.send(msg.payload);
                    }
                    Ok(())
                }
            })
            .await
            .unwrap();

        let id = queue
            .enqueue(&topic, b"hello".to_vec())
            .await
            .expect("enqueue");
        assert!(!id.is_empty());
        let payload = tokio::time::timeout(std::time::Duration::from_secs(1), rx)
            .await
            .expect("timeout")
            .expect("rx");
        assert_eq!(payload, b"hello");
        queue.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn queue_full_returns_error() {
        let queue = LocalMemoryQueue::builder().capacity(1).build();
        let topic = Topic::new("test.full");
        // Consumer that never drains quickly: sleep on each message.
        queue
            .subscribe(topic.clone(), |_msg| async {
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                Ok(())
            })
            .await
            .unwrap();

        // Fill buffer (capacity 1) + one in-flight to consumer may free a slot;
        // keep sending until Full is observed.
        let mut saw_full = false;
        for i in 0..8 {
            match queue.enqueue(&topic, vec![i]).await {
                Ok(_) => {}
                Err(EnqueueError::Full) => {
                    saw_full = true;
                    break;
                }
                Err(other) => panic!("unexpected error: {other}"),
            }
        }
        assert!(saw_full, "expected EnqueueError::Full");
        queue.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn fifo_order_with_single_consumer() {
        let queue = LocalMemoryQueue::builder().capacity(32).build();
        let topic = Topic::new("test.fifo");
        let seen = Arc::new(Mutex::new(Vec::new()));
        let (done_tx, done_rx) = oneshot::channel::<()>();
        let done_tx = Arc::new(Mutex::new(Some(done_tx)));
        let seen_h = Arc::clone(&seen);
        let done_h = Arc::clone(&done_tx);

        queue
            .subscribe(topic.clone(), move |msg| {
                let seen_h = Arc::clone(&seen_h);
                let done_h = Arc::clone(&done_h);
                async move {
                    let n = msg.payload[0];
                    seen_h.lock().await.push(n);
                    if n == 4 {
                        if let Some(tx) = done_h.lock().await.take() {
                            let _ = tx.send(());
                        }
                    }
                    Ok(())
                }
            })
            .await
            .unwrap();

        for i in 0..5u8 {
            queue.enqueue(&topic, vec![i]).await.unwrap();
        }
        tokio::time::timeout(std::time::Duration::from_secs(2), done_rx)
            .await
            .expect("timeout")
            .unwrap();
        assert_eq!(*seen.lock().await, vec![0, 1, 2, 3, 4]);
        queue.shutdown().await.unwrap();
    }

    #[tokio::test]
    async fn enqueue_without_consumer_errors() {
        let queue = LocalMemoryQueue::builder().capacity(4).build();
        let err = queue
            .enqueue(&Topic::new("missing"), b"x".to_vec())
            .await
            .unwrap_err();
        assert_eq!(err, EnqueueError::NoConsumer);
    }

    #[tokio::test]
    async fn shutdown_rejects_enqueue() {
        let queue = LocalMemoryQueue::builder().capacity(4).build();
        let topic = Topic::new("test.sd");
        let count = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&count);
        queue
            .subscribe(topic.clone(), move |_| {
                let c = Arc::clone(&c);
                async move {
                    c.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                }
            })
            .await
            .unwrap();
        queue.shutdown().await.unwrap();
        assert_eq!(
            queue.enqueue(&topic, b"x".to_vec()).await.unwrap_err(),
            EnqueueError::ShuttingDown
        );
    }
}
