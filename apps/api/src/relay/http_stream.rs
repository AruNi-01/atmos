//! HTTP gateway streaming frames and unacked-window backpressure.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

pub const HTTP_STREAM: &str = "http";
pub const HTTP_STREAM_CHUNK_SIZE: usize = 32 * 1024;
pub const HTTP_STREAM_WINDOW: u32 = 8;

pub const HTTP_KIND_REQUEST: &str = "request";
pub const HTTP_KIND_REQUEST_CHUNK: &str = "request_chunk";
pub const HTTP_KIND_REQUEST_END: &str = "request_end";
pub const HTTP_KIND_RESPONSE_START: &str = "response_start";
pub const HTTP_KIND_RESPONSE_CHUNK: &str = "response_chunk";
pub const HTTP_KIND_RESPONSE_END: &str = "response_end";
pub const HTTP_KIND_ACK: &str = "ack";
pub const HTTP_KIND_CANCEL: &str = "cancel";
pub const HTTP_KIND_ERROR: &str = "error";

#[derive(Debug)]
pub struct Cancelled;

struct AckWindowInner {
    next_seq: u32,
    acked_seq: i64,
    max_unacked: u32,
}

pub struct AckWindow {
    inner: Mutex<AckWindowInner>,
    notify: Notify,
    blocked: AtomicU64,
}

impl AckWindow {
    pub fn new(max_unacked: u32) -> Self {
        Self {
            inner: Mutex::new(AckWindowInner {
                next_seq: 0,
                acked_seq: -1,
                max_unacked,
            }),
            notify: Notify::new(),
            blocked: AtomicU64::new(0),
        }
    }

    #[allow(dead_code)]
    pub fn blocked(&self) -> u64 {
        self.blocked.load(Ordering::SeqCst)
    }

    #[allow(dead_code)]
    pub fn unacked(&self) -> u32 {
        let inner = self.inner.lock().expect("ack window mutex");
        in_flight(inner.next_seq, inner.acked_seq)
    }

    pub fn ack(&self, seq: u32) {
        let mut inner = self.inner.lock().expect("ack window mutex");
        if (seq as i64) > inner.acked_seq {
            inner.acked_seq = seq as i64;
        }
        self.notify.notify_waiters();
    }

    pub async fn take_slot(&self, cancel: &CancellationToken) -> Result<u32, Cancelled> {
        loop {
            if cancel.is_cancelled() {
                return Err(Cancelled);
            }
            let notified = self.notify.notified();
            {
                let mut inner = self.inner.lock().expect("ack window mutex");
                let inflight = in_flight(inner.next_seq, inner.acked_seq);
                if inflight < inner.max_unacked {
                    let seq = inner.next_seq;
                    inner.next_seq += 1;
                    return Ok(seq);
                }
                self.blocked.fetch_add(1, Ordering::SeqCst);
            }
            tokio::select! {
                _ = cancel.cancelled() => return Err(Cancelled),
                _ = notified => {}
            }
        }
    }
}

fn in_flight(next_seq: u32, acked_seq: i64) -> u32 {
    let inflight = next_seq as i64 - acked_seq - 1;
    inflight.max(0) as u32
}

pub fn http_envelope(
    kind: &str,
    request_id: &str,
    seq: Option<u32>,
    body: Option<String>,
) -> String {
    let mut value = json!({
        "v": 1_u32,
        "stream": HTTP_STREAM,
        "kind": kind,
        "request_id": request_id,
    });
    if let Some(seq) = seq {
        value["seq"] = Value::from(seq);
    }
    if let Some(body) = body {
        value["body"] = Value::String(body);
    }
    value.to_string()
}

pub fn http_error_envelope(request_id: &str, status: u16, code: &str) -> String {
    http_envelope(
        HTTP_KIND_ERROR,
        request_id,
        None,
        Some(
            json!({
                "status": status,
                "code": code,
            })
            .to_string(),
        ),
    )
}

pub type SharedAckWindow = Arc<AckWindow>;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::time::Duration;

    #[tokio::test]
    async fn window_blocks_until_ack() {
        let window = Arc::new(AckWindow::new(2));
        let cancel = CancellationToken::new();
        assert_eq!(window.take_slot(&cancel).await.ok(), Some(0));
        assert_eq!(window.take_slot(&cancel).await.ok(), Some(1));
        assert_eq!(window.unacked(), 2);

        let waiter = {
            let window = Arc::clone(&window);
            let cancel = cancel.clone();
            tokio::spawn(async move { window.take_slot(&cancel).await.ok() })
        };
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(!waiter.is_finished());
        window.ack(0);
        assert_eq!(waiter.await.unwrap(), Some(2));
        assert!(window.blocked() >= 1);
    }

    #[tokio::test]
    async fn take_slot_stops_on_cancel() {
        let window = AckWindow::new(1);
        let cancel = CancellationToken::new();
        window.take_slot(&cancel).await.unwrap();
        let wait = window.take_slot(&cancel);
        cancel.cancel();
        assert!(wait.await.is_err());
    }
}
