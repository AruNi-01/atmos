//! Relay HTTP gateway — stream proxied requests against loopback `apps/api`.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use futures_util::StreamExt;
use reqwest::header::{HeaderName, HeaderValue, AUTHORIZATION};
use reqwest::Method;
use runtime_manager::read_runtime_manifest;
use serde::Deserialize;
use tokio::io::AsyncWriteExt;
use tokio::sync::{mpsc, RwLock};
use tokio_tungstenite::tungstenite::Message;
use tokio_util::io::ReaderStream;
use tokio_util::sync::CancellationToken;
use tracing::warn;

use super::http_stream::{
    http_envelope, http_error_envelope, AckWindow, SharedAckWindow, HTTP_KIND_ACK,
    HTTP_KIND_CANCEL, HTTP_KIND_REQUEST, HTTP_KIND_REQUEST_CHUNK, HTTP_KIND_REQUEST_END,
    HTTP_KIND_RESPONSE_CHUNK, HTTP_KIND_RESPONSE_END, HTTP_KIND_RESPONSE_START,
    HTTP_STREAM_CHUNK_SIZE, HTTP_STREAM_WINDOW,
};

const HOP_BY_HOP: &[&str] = &[
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
];

#[derive(Debug, Deserialize)]
pub struct HttpRelayRequestStart {
    method: String,
    path: String,
    headers: Vec<(String, String)>,
    #[serde(default)]
    body_b64: Option<String>,
    #[serde(default)]
    streaming: bool,
}

#[derive(Debug, serde::Serialize)]
struct HttpRelayResponseStart {
    status: u16,
    headers: Vec<(String, String)>,
}

pub enum RequestBodyEvent {
    Chunk { data: Vec<u8> },
    End,
}

enum AdmitMsg {
    Chunk { data: Vec<u8>, seq: Option<u32> },
    End,
}

pub struct HttpInflight {
    admit_tx: mpsc::UnboundedSender<AdmitMsg>,
    pub acks: SharedAckWindow,
    pub cancel: CancellationToken,
}

fn spawn_body_admission(
    mut admit_rx: mpsc::UnboundedReceiver<AdmitMsg>,
    body_tx: mpsc::Sender<RequestBodyEvent>,
    out: mpsc::UnboundedSender<Message>,
    request_id: String,
    cancel: CancellationToken,
) {
    tokio::spawn(async move {
        let stop = cancel.clone();
        loop {
            tokio::select! {
                _ = stop.cancelled() => break,
                msg = admit_rx.recv() => {
                    let Some(msg) = msg else {
                        break;
                    };
                    match msg {
                        AdmitMsg::Chunk { data, seq } => {
                            if body_tx.send(RequestBodyEvent::Chunk { data }).await.is_err() {
                                cancel.cancel();
                                break;
                            }
                            let ack = http_envelope(HTTP_KIND_ACK, &request_id, seq, None);
                            let _ = out.send(Message::Text(ack));
                        }
                        AdmitMsg::End => {
                            let _ = body_tx.send(RequestBodyEvent::End).await;
                            break;
                        }
                    }
                }
            }
        }
    });
}

pub type HttpGatewaySessions = Arc<RwLock<HashMap<String, HttpInflight>>>;

#[derive(Clone)]
pub struct GatewayUpstream {
    pub base_url: String,
    pub local_token: Option<String>,
}

pub fn new_session_map() -> HttpGatewaySessions {
    Arc::new(RwLock::new(HashMap::new()))
}

pub async fn cancel_all(sessions: &HttpGatewaySessions) {
    let mut locked = sessions.write().await;
    for (_, session) in locked.drain() {
        session.cancel.cancel();
    }
}

pub async fn on_http_envelope(
    sessions: &HttpGatewaySessions,
    kind: &str,
    request_id: Option<&str>,
    seq: Option<u32>,
    body: Option<&str>,
    out: &mpsc::UnboundedSender<Message>,
) {
    let Some(request_id) = request_id.filter(|id| !id.is_empty()) else {
        return;
    };

    if kind == HTTP_KIND_REQUEST {
        start_session(sessions, request_id, body.unwrap_or("{}"), out).await;
        return;
    }

    if kind == HTTP_KIND_CANCEL {
        if let Some(session) = sessions.write().await.remove(request_id) {
            session.cancel.cancel();
        }
        return;
    }

    let inflight = {
        let locked = sessions.read().await;
        locked.get(request_id).map(|session| {
            (
                session.admit_tx.clone(),
                Arc::clone(&session.acks),
                session.cancel.clone(),
            )
        })
    };
    let Some((admit_tx, acks, cancel)) = inflight else {
        return;
    };
    match kind {
        k if k == HTTP_KIND_REQUEST_CHUNK => {
            let Some(b64) = body.filter(|s| !s.is_empty()) else {
                return;
            };
            match B64.decode(b64) {
                Ok(data) => {
                    if admit_tx.send(AdmitMsg::Chunk { data, seq }).is_err() {
                        cancel.cancel();
                    }
                }
                Err(error) => {
                    warn!(
                        target: "atmos_relay",
                        error = %error,
                        request_id = %request_id,
                        "http gateway chunk base64 decode failed"
                    );
                    let _ = out.send(Message::Text(http_error_envelope(
                        request_id,
                        400,
                        "invalid_chunk",
                    )));
                    cancel.cancel();
                }
            }
        }
        k if k == HTTP_KIND_REQUEST_END => {
            let _ = admit_tx.send(AdmitMsg::End);
        }
        k if k == HTTP_KIND_ACK => {
            if let Some(seq) = seq {
                acks.ack(seq);
            }
        }
        _ => {}
    }
}

async fn start_session(
    sessions: &HttpGatewaySessions,
    request_id: &str,
    body: &str,
    out: &mpsc::UnboundedSender<Message>,
) {
    let start: HttpRelayRequestStart = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(error) => {
            warn!(
                target: "atmos_relay",
                error = %error,
                "http gateway request decode failed"
            );
            let _ = out.send(Message::Text(http_error_envelope(
                request_id,
                400,
                "invalid_http_request",
            )));
            return;
        }
    };

    if Method::from_bytes(start.method.as_bytes()).is_err() {
        let _ = out.send(Message::Text(http_error_envelope(
            request_id,
            400,
            "invalid_method",
        )));
        return;
    }

    let upstream = match gateway_upstream() {
        Ok(v) => v,
        Err(code) => {
            let _ = out.send(Message::Text(http_error_envelope(request_id, 503, code)));
            return;
        }
    };

    let (body_tx, body_rx) = mpsc::channel(HTTP_STREAM_WINDOW as usize);
    let (admit_tx, admit_rx) = mpsc::unbounded_channel();
    let acks = Arc::new(AckWindow::new(HTTP_STREAM_WINDOW));
    let cancel = CancellationToken::new();
    spawn_body_admission(
        admit_rx,
        body_tx.clone(),
        out.clone(),
        request_id.to_string(),
        cancel.clone(),
    );
    if !start.streaming {
        if let Some(b64) = start.body_b64.as_ref().filter(|s| !s.is_empty()) {
            match B64.decode(b64) {
                Ok(data) => {
                    let _ = body_tx.try_send(RequestBodyEvent::Chunk { data });
                }
                Err(error) => {
                    warn!(
                        target: "atmos_relay",
                        error = %error,
                        "http gateway body base64 decode failed"
                    );
                    let _ = out.send(Message::Text(http_error_envelope(
                        request_id,
                        400,
                        "invalid_body",
                    )));
                    return;
                }
            }
        }
        let _ = body_tx.try_send(RequestBodyEvent::End);
    }

    sessions.write().await.insert(
        request_id.to_string(),
        HttpInflight {
            admit_tx,
            acks: Arc::clone(&acks),
            cancel: cancel.clone(),
        },
    );

    let request_id = request_id.to_string();
    let out = out.clone();
    let sessions = Arc::clone(sessions);
    tokio::spawn(async move {
        run_http_stream(HttpStreamParams {
            request_id: request_id.clone(),
            start,
            upstream,
            body_events: body_rx,
            acks,
            cancel,
            out,
            chunk_size: HTTP_STREAM_CHUNK_SIZE,
        })
        .await;
        sessions.write().await.remove(&request_id);
    });
}

struct HttpStreamParams {
    request_id: String,
    start: HttpRelayRequestStart,
    upstream: GatewayUpstream,
    body_events: mpsc::Receiver<RequestBodyEvent>,
    acks: SharedAckWindow,
    cancel: CancellationToken,
    out: mpsc::UnboundedSender<Message>,
    chunk_size: usize,
}

async fn run_http_stream(params: HttpStreamParams) {
    let HttpStreamParams {
        request_id,
        start,
        upstream,
        body_events,
        acks,
        cancel,
        out,
        chunk_size,
    } = params;

    if let Err(code) = run_http_stream_inner(
        &request_id,
        start,
        upstream,
        body_events,
        acks,
        &cancel,
        &out,
        chunk_size,
    )
    .await
    {
        if !cancel.is_cancelled() {
            let status = if code == "invalid_method" { 400 } else { 502 };
            let _ = out.send(Message::Text(http_error_envelope(
                &request_id,
                status,
                code,
            )));
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_http_stream_inner(
    request_id: &str,
    start: HttpRelayRequestStart,
    upstream: GatewayUpstream,
    mut body_events: mpsc::Receiver<RequestBodyEvent>,
    acks: SharedAckWindow,
    cancel: &CancellationToken,
    out: &mpsc::UnboundedSender<Message>,
    chunk_size: usize,
) -> Result<(), &'static str> {
    let base = upstream.base_url.trim_end_matches('/');
    let path = if start.path.starts_with('/') {
        start.path.clone()
    } else {
        format!("/{}", start.path)
    };
    let url = format!("{base}{path}");

    let method = Method::from_bytes(start.method.as_bytes()).map_err(|_| "invalid_method")?;
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "gateway_client_error")?;

    let mut builder = client.request(method, &url);
    let mut has_auth = false;
    for (name, value) in &start.headers {
        let lower = name.to_ascii_lowercase();
        if HOP_BY_HOP.contains(&lower.as_str()) {
            continue;
        }
        if lower == "authorization" {
            continue;
        }
        if lower == "origin" || lower == "referer" {
            continue;
        }
        let Ok(header_name) = HeaderName::from_bytes(name.as_bytes()) else {
            continue;
        };
        let Ok(header_value) = HeaderValue::from_str(value) else {
            continue;
        };
        if lower == "x-atmos-api-token" {
            has_auth = true;
            builder = builder.header(AUTHORIZATION, format!("Bearer {value}"));
            continue;
        }
        builder = builder.header(header_name, header_value);
    }
    if !has_auth {
        if let Some(token) = upstream.local_token.as_deref().filter(|s| !s.is_empty()) {
            builder = builder.header(AUTHORIZATION, format!("Bearer {token}"));
        } else if let Some(token) = relay_gateway_local_token() {
            builder = builder.header(AUTHORIZATION, format!("Bearer {token}"));
        }
    }
    builder = builder.header("X-Atmos-Relay-Gateway", "1");

    let (writer, reader) =
        tokio::io::duplex((HTTP_STREAM_WINDOW as usize) * HTTP_STREAM_CHUNK_SIZE.max(1));
    let feeder_cancel = cancel.clone();
    let feeder = tokio::spawn(async move {
        let mut writer = writer;
        loop {
            tokio::select! {
                _ = feeder_cancel.cancelled() => {
                    break;
                }
                event = body_events.recv() => {
                    match event {
                        Some(RequestBodyEvent::Chunk { data }) => {
                            if writer.write_all(&data).await.is_err() {
                                break;
                            }
                        }
                        Some(RequestBodyEvent::End) | None => break,
                    }
                }
            }
        }
        let _ = writer.shutdown().await;
    });

    builder = builder.body(reqwest::Body::wrap_stream(ReaderStream::new(reader)));

    let send = builder.send();
    let resp = tokio::select! {
        _ = cancel.cancelled() => {
            feeder.abort();
            return Ok(());
        }
        result = send => result.map_err(|_| "upstream_unreachable")?,
    };

    let status = resp.status().as_u16();
    let mut out_headers: Vec<(String, String)> = Vec::new();
    for (name, value) in resp.headers().iter() {
        let lower = name.as_str().to_ascii_lowercase();
        if HOP_BY_HOP.contains(&lower.as_str()) {
            continue;
        }
        if let Ok(value) = value.to_str() {
            out_headers.push((name.to_string(), value.to_string()));
        }
    }

    let start_body = serde_json::to_string(&HttpRelayResponseStart {
        status,
        headers: out_headers,
    })
    .map_err(|_| "response_encode_error")?;
    out.send(Message::Text(http_envelope(
        HTTP_KIND_RESPONSE_START,
        request_id,
        None,
        Some(start_body),
    )))
    .map_err(|_| "gateway_internal_error")?;

    let mut byte_stream = resp.bytes_stream();
    loop {
        let next = tokio::select! {
            _ = cancel.cancelled() => {
                feeder.abort();
                return Ok(());
            }
            part = byte_stream.next() => part,
        };
        let Some(part) = next else {
            break;
        };
        let bytes = part.map_err(|_| "upstream_body_error")?;
        if bytes.is_empty() {
            continue;
        }
        let mut offset = 0;
        while offset < bytes.len() {
            if cancel.is_cancelled() {
                feeder.abort();
                return Ok(());
            }
            let end = (offset + chunk_size).min(bytes.len());
            let seq = acks.take_slot(cancel).await.map_err(|_| "cancelled")?;
            let encoded = B64.encode(&bytes[offset..end]);
            out.send(Message::Text(http_envelope(
                HTTP_KIND_RESPONSE_CHUNK,
                request_id,
                Some(seq),
                Some(encoded),
            )))
            .map_err(|_| "gateway_internal_error")?;
            offset = end;
        }
    }

    out.send(Message::Text(http_envelope(
        HTTP_KIND_RESPONSE_END,
        request_id,
        None,
        None,
    )))
    .map_err(|_| "gateway_internal_error")?;
    feeder.abort();
    Ok(())
}

fn gateway_upstream() -> Result<GatewayUpstream, &'static str> {
    match read_runtime_manifest() {
        Ok(Some(manifest)) => Ok(GatewayUpstream {
            base_url: manifest.api.url,
            local_token: relay_gateway_local_token(),
        }),
        Ok(None) => Err("runtime_manifest_missing"),
        Err(error) => {
            warn!(target: "atmos_relay", error = %error, "manifest read failed");
            Err("runtime_manifest_unreadable")
        }
    }
}

fn relay_gateway_local_token() -> Option<String> {
    for key in ["ATMOS_LOCAL_TOKEN", "ATMOS_API_TOKEN"] {
        if let Ok(token) = std::env::var(key) {
            if !token.trim().is_empty() {
                return Some(token);
            }
        }
    }
    None
}

#[cfg(test)]
pub(crate) async fn run_http_stream_for_test(params: HttpStreamTestParams) {
    run_http_stream(HttpStreamParams {
        request_id: params.request_id,
        start: params.start,
        upstream: params.upstream,
        body_events: params.body_events,
        acks: params.acks,
        cancel: params.cancel,
        out: params.out,
        chunk_size: params.chunk_size,
    })
    .await;
}

#[cfg(test)]
pub(crate) struct HttpStreamTestParams {
    pub request_id: String,
    pub start: HttpRelayRequestStart,
    pub upstream: GatewayUpstream,
    pub body_events: mpsc::Receiver<RequestBodyEvent>,
    pub acks: SharedAckWindow,
    pub cancel: CancellationToken,
    pub out: mpsc::UnboundedSender<Message>,
    pub chunk_size: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::extract::DefaultBodyLimit;
    use axum::response::IntoResponse;
    use axum::routing::{get, put};
    use axum::Router;
    use serde_json::Value;
    use std::net::SocketAddr;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering as AtomicOrdering};
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::sync::mpsc;

    fn parse_env(text: &str) -> Value {
        serde_json::from_str(text).expect("envelope json")
    }

    async fn start_echo_server() -> (SocketAddr, Arc<AtomicUsize>, Arc<AtomicBool>) {
        let received = Arc::new(AtomicUsize::new(0));
        let cancelled = Arc::new(AtomicBool::new(false));
        let received_c = Arc::clone(&received);
        let cancelled_c = Arc::clone(&cancelled);
        let app = Router::new()
            .route(
                "/echo",
                put(move |body: axum::body::Bytes| async move {
                    received_c.fetch_add(body.len(), AtomicOrdering::SeqCst);
                    body
                }),
            )
            .route(
                "/slow",
                get(move || {
                    let cancelled = Arc::clone(&cancelled_c);
                    async move {
                        let (tx, rx) = mpsc::channel::<Result<Vec<u8>, std::io::Error>>(1);
                        tokio::spawn(async move {
                            loop {
                                if tx.send(Ok(vec![b'x'; 4096])).await.is_err() {
                                    cancelled.store(true, AtomicOrdering::SeqCst);
                                    break;
                                }
                                tokio::time::sleep(Duration::from_millis(15)).await;
                            }
                        });
                        let stream = futures_util::stream::unfold(rx, |mut rx| async move {
                            rx.recv().await.map(|item| (item, rx))
                        });
                        Body::from_stream(stream).into_response()
                    }
                }),
            )
            .layer(DefaultBodyLimit::max(32 * 1024 * 1024));

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        tokio::time::sleep(Duration::from_millis(20)).await;
        (addr, received, cancelled)
    }

    #[tokio::test]
    async fn streams_several_megabytes_with_backpressure() {
        let (addr, received, _) = start_echo_server().await;
        let payload = vec![0x5a; 4 * 1024 * 1024];
        let (out_tx, mut out_rx) = mpsc::unbounded_channel();
        let (body_tx, body_rx) = mpsc::channel(256);
        let acks = Arc::new(AckWindow::new(2));
        let cancel = CancellationToken::new();
        let request_id = "req-large".to_string();

        let acks_for_task = Arc::clone(&acks);
        let pump = tokio::spawn(async move {
            run_http_stream_for_test(HttpStreamTestParams {
                request_id,
                start: HttpRelayRequestStart {
                    method: "PUT".into(),
                    path: "/echo".into(),
                    headers: vec![("content-type".into(), "application/octet-stream".into())],
                    body_b64: None,
                    streaming: true,
                },
                upstream: GatewayUpstream {
                    base_url: format!("http://{addr}"),
                    local_token: None,
                },
                body_events: body_rx,
                acks: acks_for_task,
                cancel,
                out: out_tx,
                chunk_size: 32 * 1024,
            })
            .await;
        });

        let mut offset = 0;
        while offset < payload.len() {
            let end = (offset + 32 * 1024).min(payload.len());
            body_tx
                .send(RequestBodyEvent::Chunk {
                    data: payload[offset..end].to_vec(),
                })
                .await
                .unwrap();
            offset = end;
        }
        body_tx.send(RequestBodyEvent::End).await.unwrap();

        let mut echoed = Vec::new();
        loop {
            let msg = tokio::time::timeout(Duration::from_secs(15), out_rx.recv())
                .await
                .expect("timed out")
                .expect("closed");
            let Message::Text(text) = msg else {
                continue;
            };
            let value = parse_env(&text);
            match value["kind"].as_str() {
                Some(HTTP_KIND_RESPONSE_CHUNK) => {
                    let seq = value["seq"].as_u64().unwrap() as u32;
                    let chunk = B64
                        .decode(value["body"].as_str().unwrap())
                        .expect("chunk b64");
                    echoed.extend_from_slice(&chunk);
                    acks.ack(seq);
                }
                Some(HTTP_KIND_RESPONSE_END) => break,
                Some("error") => {
                    panic!("gateway error: {value}");
                }
                _ => {}
            }
        }

        pump.await.unwrap();
        assert_eq!(received.load(AtomicOrdering::SeqCst), payload.len());
        assert_eq!(echoed, payload);
        assert!(acks.blocked() >= 1, "window must stall on unacked chunks");
    }

    #[tokio::test]
    async fn cancel_stops_in_flight_upstream_response() {
        let (addr, _, cancelled) = start_echo_server().await;
        let (out_tx, mut out_rx) = mpsc::unbounded_channel();
        let (body_tx, body_rx) = mpsc::channel(8);
        let acks = Arc::new(AckWindow::new(8));
        let cancel = CancellationToken::new();
        let request_id = "req-cancel".to_string();

        let runner_cancel = cancel.clone();
        let acks_for_task = Arc::clone(&acks);
        tokio::spawn(async move {
            run_http_stream_for_test(HttpStreamTestParams {
                request_id,
                start: HttpRelayRequestStart {
                    method: "GET".into(),
                    path: "/slow".into(),
                    headers: vec![],
                    body_b64: None,
                    streaming: true,
                },
                upstream: GatewayUpstream {
                    base_url: format!("http://{addr}"),
                    local_token: None,
                },
                body_events: body_rx,
                acks: acks_for_task,
                cancel: runner_cancel,
                out: out_tx,
                chunk_size: 32 * 1024,
            })
            .await;
        });
        body_tx.send(RequestBodyEvent::End).await.unwrap();

        let mut saw_chunk = false;
        while let Ok(Some(msg)) = tokio::time::timeout(Duration::from_secs(5), out_rx.recv()).await
        {
            let Message::Text(text) = msg else { continue };
            let value = parse_env(&text);
            if value["kind"].as_str() == Some(HTTP_KIND_RESPONSE_CHUNK) {
                let seq = value["seq"].as_u64().unwrap() as u32;
                acks.ack(seq);
                saw_chunk = true;
                break;
            }
        }
        assert!(saw_chunk, "upstream must start streaming before cancel");
        cancel.cancel();

        tokio::time::timeout(Duration::from_secs(3), async {
            while !cancelled.load(AtomicOrdering::SeqCst) {
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("upstream HTTP was not cancelled after client abort");
        assert!(cancelled.load(AtomicOrdering::SeqCst));
    }

    #[tokio::test]
    async fn ingest_cancel_kind_stops_session() {
        let sessions = new_session_map();
        let (out_tx, _out_rx) = mpsc::unbounded_channel();
        let cancel = CancellationToken::new();
        let (admit_tx, _admit_rx) = mpsc::unbounded_channel();
        sessions.write().await.insert(
            "req-1".into(),
            HttpInflight {
                admit_tx,
                acks: Arc::new(AckWindow::new(8)),
                cancel: cancel.clone(),
            },
        );

        on_http_envelope(
            &sessions,
            HTTP_KIND_CANCEL,
            Some("req-1"),
            None,
            None,
            &out_tx,
        )
        .await;

        assert!(cancel.is_cancelled());
        assert!(sessions.read().await.get("req-1").is_none());
    }

    #[tokio::test]
    async fn invalid_method_returns_400() {
        let sessions = new_session_map();
        let (out_tx, mut out_rx) = mpsc::unbounded_channel();
        on_http_envelope(
            &sessions,
            HTTP_KIND_REQUEST,
            Some("req-bad-method"),
            None,
            Some(r#"{"method":"NOT A METHOD","path":"/x","headers":[],"streaming":true}"#),
            &out_tx,
        )
        .await;
        let Message::Text(text) = out_rx.try_recv().expect("error envelope") else {
            panic!("expected text");
        };
        let value = parse_env(&text);
        assert_eq!(value["kind"], "error");
        let body: Value = serde_json::from_str(value["body"].as_str().unwrap()).unwrap();
        assert_eq!(body["status"], 400);
        assert_eq!(body["code"], "invalid_method");
    }

    #[tokio::test]
    async fn invalid_chunk_sends_error_envelope() {
        let sessions = new_session_map();
        let (out_tx, mut out_rx) = mpsc::unbounded_channel();
        let cancel = CancellationToken::new();
        let (admit_tx, _admit_rx) = mpsc::unbounded_channel();
        sessions.write().await.insert(
            "req-bad-chunk".into(),
            HttpInflight {
                admit_tx,
                acks: Arc::new(AckWindow::new(8)),
                cancel: cancel.clone(),
            },
        );
        on_http_envelope(
            &sessions,
            HTTP_KIND_REQUEST_CHUNK,
            Some("req-bad-chunk"),
            Some(0),
            Some("!!!not-b64!!!"),
            &out_tx,
        )
        .await;
        let Message::Text(text) = out_rx.try_recv().expect("error envelope") else {
            panic!("expected text");
        };
        let value = parse_env(&text);
        assert_eq!(value["kind"], "error");
        let body: Value = serde_json::from_str(value["body"].as_str().unwrap()).unwrap();
        assert_eq!(body["status"], 400);
        assert_eq!(body["code"], "invalid_chunk");
        assert!(cancel.is_cancelled());
    }

    #[tokio::test]
    async fn bounded_queue_acks_only_after_capacity() {
        let sessions = new_session_map();
        let (out_tx, mut out_rx) = mpsc::unbounded_channel();
        let cancel = CancellationToken::new();
        let (body_tx, mut body_rx) = mpsc::channel(1);
        let (admit_tx, admit_rx) = mpsc::unbounded_channel();
        spawn_body_admission(
            admit_rx,
            body_tx,
            out_tx.clone(),
            "req-bound".into(),
            cancel.clone(),
        );
        sessions.write().await.insert(
            "req-bound".into(),
            HttpInflight {
                admit_tx,
                acks: Arc::new(AckWindow::new(8)),
                cancel: cancel.clone(),
            },
        );

        on_http_envelope(
            &sessions,
            HTTP_KIND_REQUEST_CHUNK,
            Some("req-bound"),
            Some(0),
            Some("YQ=="),
            &out_tx,
        )
        .await;
        let Message::Text(first) = tokio::time::timeout(Duration::from_secs(1), out_rx.recv())
            .await
            .expect("first ack timeout")
            .expect("first ack closed")
        else {
            panic!("expected text");
        };
        let first_env = parse_env(&first);
        assert_eq!(first_env["kind"], "ack");
        assert_eq!(first_env["seq"], 0);

        let started = std::time::Instant::now();
        on_http_envelope(
            &sessions,
            HTTP_KIND_REQUEST_CHUNK,
            Some("req-bound"),
            Some(1),
            Some("Yg=="),
            &out_tx,
        )
        .await;
        assert!(
            started.elapsed() < Duration::from_millis(50),
            "ingest must not wait on a full body queue"
        );
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(out_rx.try_recv().is_err());

        match body_rx.recv().await.unwrap() {
            RequestBodyEvent::Chunk { data } => assert_eq!(data, b"a"),
            RequestBodyEvent::End => panic!("expected chunk"),
        }
        let Message::Text(second_ack) = tokio::time::timeout(Duration::from_secs(1), out_rx.recv())
            .await
            .expect("second ack timeout")
            .expect("second ack closed")
        else {
            panic!("expected text");
        };
        let second_env = parse_env(&second_ack);
        assert_eq!(second_env["kind"], "ack");
        assert_eq!(second_env["seq"], 1);
    }
}
