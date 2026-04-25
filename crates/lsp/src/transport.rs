use std::collections::HashMap;
use std::io;

use anyhow::Context;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum JsonRpcMessage {
    Request {
        jsonrpc: String,
        id: Value,
        method: String,
        params: Option<Value>,
    },
    Response {
        jsonrpc: String,
        id: Value,
        result: Option<Value>,
        error: Option<Value>,
    },
    Notification {
        jsonrpc: String,
        method: String,
        params: Option<Value>,
    },
}

pub struct LspTransport<R, W>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    reader: BufReader<R>,
    writer: W,
}

impl<R, W> LspTransport<R, W>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    pub fn new(reader: R, writer: W) -> Self {
        Self {
            reader: BufReader::new(reader),
            writer,
        }
    }

    pub fn into_parts(self) -> (BufReader<R>, W) {
        (self.reader, self.writer)
    }

    pub async fn send(&mut self, message: &JsonRpcMessage) -> anyhow::Result<()> {
        send_message_to(&mut self.writer, message).await
    }

    pub async fn read(&mut self) -> anyhow::Result<JsonRpcMessage> {
        read_message_from(&mut self.reader).await
    }
}

pub async fn send_message_to<W>(writer: &mut W, message: &JsonRpcMessage) -> anyhow::Result<()>
where
    W: AsyncWrite + Unpin,
{
    let payload = serde_json::to_vec(message).context("failed to encode json-rpc message")?;
    let header = format!("Content-Length: {}\r\n\r\n", payload.len());
    writer
        .write_all(header.as_bytes())
        .await
        .context("failed to write json-rpc header")?;
    writer
        .write_all(&payload)
        .await
        .context("failed to write json-rpc payload")?;
    writer
        .flush()
        .await
        .context("failed to flush json-rpc stream")?;
    Ok(())
}

pub async fn read_message_from<R>(reader: &mut BufReader<R>) -> anyhow::Result<JsonRpcMessage>
where
    R: AsyncRead + Unpin,
{
    let headers = read_headers_from(reader).await?;
    let len = headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .ok_or_else(|| anyhow::anyhow!("missing content-length header"))?;

    let mut payload = vec![0_u8; len];
    reader
        .read_exact(&mut payload)
        .await
        .context("failed to read json-rpc payload")?;

    serde_json::from_slice(&payload).context("failed to decode json-rpc payload")
}

async fn read_headers_from<R>(reader: &mut BufReader<R>) -> anyhow::Result<HashMap<String, String>>
where
    R: AsyncRead + Unpin,
{
    let mut headers = HashMap::new();
    loop {
        let mut line = String::new();
        let bytes = reader.read_line(&mut line).await?;
        if bytes == 0 {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "unexpected EOF").into());
        }

        if line == "\r\n" {
            return Ok(headers);
        }

        if let Some((key, value)) = line.split_once(':') {
            headers.insert(key.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }
}

pub fn initialize_request(root_uri: &str) -> JsonRpcMessage {
    initialize_request_with_options(root_uri, "{}")
        .expect("default initialize options should be valid json")
}

pub fn initialized_notification() -> JsonRpcMessage {
    JsonRpcMessage::Notification {
        jsonrpc: "2.0".to_string(),
        method: "initialized".to_string(),
        params: Some(serde_json::json!({})),
    }
}

pub fn initialize_request_with_options(
    root_uri: &str,
    initialization_options: &str,
) -> anyhow::Result<JsonRpcMessage> {
    let options: Value = serde_json::from_str(initialization_options)
        .context("invalid initialization_options json")?;

    Ok(JsonRpcMessage::Request {
        jsonrpc: "2.0".to_string(),
        id: Value::from(1),
        method: "initialize".to_string(),
        params: Some(serde_json::json!({
            "processId": std::process::id(),
            "rootUri": root_uri,
            "capabilities": {},
            "initializationOptions": options
        })),
    })
}
