//! HTTP/1.1 client for OpenCode serve. h2c POST with a body hangs (Orca ADR 0014).

use std::path::Path;
use std::time::Duration;

use reqwest::{Client, RequestBuilder, StatusCode};
use serde_json::Value;

use crate::contract::{AgentProviderError, AgentResult};

use super::spawn::USERNAME;

const DIRECTORY_HEADER: &str = "x-opencode-directory";
const RPC_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone)]
pub struct OpenCodeHttp {
    rpc: Client,
    sse: Client,
    base_url: String,
    username: String,
    password: String,
    directory: String,
}

impl std::fmt::Debug for OpenCodeHttp {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OpenCodeHttp")
            .field("base_url", &self.base_url)
            .field("directory", &self.directory)
            .finish_non_exhaustive()
    }
}

pub fn rpc_client_builder() -> reqwest::ClientBuilder {
    Client::builder().http1_only().timeout(RPC_TIMEOUT)
}

pub fn sse_client_builder() -> reqwest::ClientBuilder {
    Client::builder().http1_only()
}

fn directory_header(directory: &Path) -> String {
    directory
        .canonicalize()
        .unwrap_or_else(|_| directory.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

impl OpenCodeHttp {
    pub fn new(base_url: String, password: String, directory: &Path) -> AgentResult<Self> {
        Ok(Self {
            rpc: rpc_client_builder()
                .build()
                .map_err(|error| AgentProviderError::message(error.to_string()))?,
            sse: sse_client_builder()
                .build()
                .map_err(|error| AgentProviderError::message(error.to_string()))?,
            base_url: base_url.trim_end_matches('/').to_string(),
            username: USERNAME.to_string(),
            password,
            directory: directory_header(directory),
        })
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    fn apply(&self, builder: RequestBuilder, sse: bool) -> RequestBuilder {
        let accept = if sse {
            "text/event-stream"
        } else {
            "application/json"
        };
        builder
            .basic_auth(&self.username, Some(&self.password))
            .header(reqwest::header::ACCEPT, accept)
            .header(DIRECTORY_HEADER, &self.directory)
            .query(&[("directory", self.directory.as_str())])
    }

    fn url(&self, path: &str) -> String {
        let path = if path.starts_with('/') {
            path.to_string()
        } else {
            format!("/{path}")
        };
        format!("{}{path}", self.base_url)
    }

    pub async fn get_json(&self, path: &str) -> AgentResult<(StatusCode, Value)> {
        let response = self
            .apply(self.rpc.get(self.url(path)), false)
            .send()
            .await
            .map_err(|error| AgentProviderError::message(error.to_string()))?;
        let status = response.status();
        if status == StatusCode::NO_CONTENT {
            return Ok((status, Value::Null));
        }
        let value = response.json::<Value>().await.unwrap_or(Value::Null);
        Ok((status, value))
    }

    pub async fn post_json(&self, path: &str, body: &Value) -> AgentResult<(StatusCode, Value)> {
        let response = self
            .apply(self.rpc.post(self.url(path)), false)
            .json(body)
            .send()
            .await
            .map_err(|error| AgentProviderError::message(error.to_string()))?;
        let status = response.status();
        if status == StatusCode::NO_CONTENT {
            return Ok((status, Value::Null));
        }
        let value = response.json::<Value>().await.unwrap_or(Value::Null);
        Ok((status, value))
    }

    pub async fn post_empty(&self, path: &str) -> AgentResult<StatusCode> {
        let response = self
            .apply(self.rpc.post(self.url(path)), false)
            .send()
            .await
            .map_err(|error| AgentProviderError::message(error.to_string()))?;
        Ok(response.status())
    }

    /// `prompt_async` returns 204 with an empty body — never deserialize it as JSON.
    pub async fn post_no_content(&self, path: &str, body: &Value) -> AgentResult<StatusCode> {
        let response = self
            .apply(self.rpc.post(self.url(path)), false)
            .json(body)
            .send()
            .await
            .map_err(|error| AgentProviderError::message(error.to_string()))?;
        let status = response.status();
        let _ = response.bytes().await;
        Ok(status)
    }

    pub async fn get_sse(&self) -> AgentResult<reqwest::Response> {
        self.apply(self.sse.get(self.url("/event")), true)
            .send()
            .await
            .map_err(|error| AgentProviderError::message(error.to_string()))
    }

    pub async fn wait_for_doc(&self) -> AgentResult<Value> {
        let mut last = AgentProviderError::message("GET /doc did not return 200");
        for _ in 0..50 {
            match self.get_json("/doc").await {
                Ok((status, value)) if status.as_u16() == 200 => return Ok(value),
                Ok((status, _)) => {
                    last = AgentProviderError::message(format!("GET /doc status {status}"));
                }
                Err(error) => last = error,
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        Err(last)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[test]
    fn builders_are_http1_only() {
        let spec = crate::providers::opencode::spawn::serve_spawn_spec("opencode");
        assert!(spec.http1_only);
        let _rpc = rpc_client_builder();
        let _sse = sse_client_builder();
    }

    #[tokio::test]
    async fn rpc_client_speaks_http11_not_h2c() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind");
        let addr = listener.local_addr().expect("addr");
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.expect("accept");
            let mut buf = vec![0u8; 256];
            let n = socket.read(&mut buf).await.unwrap_or(0);
            let _ = socket
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}")
                .await;
            String::from_utf8_lossy(&buf[..n]).into_owned()
        });

        let client = rpc_client_builder().build().expect("client");
        let _ = client.get(format!("http://{addr}/doc")).send().await;
        let head = server.await.expect("join");
        assert!(
            !head.starts_with("PRI * HTTP/2.0"),
            "client must not speak h2c: {head:?}"
        );
        assert!(
            head.contains("HTTP/1.1"),
            "client must send HTTP/1.1: {head:?}"
        );
    }
}
