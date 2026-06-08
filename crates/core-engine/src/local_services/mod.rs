mod probe;
mod scanner;

use std::path::PathBuf;

use crate::error::Result;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalTcpListener {
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub local_addr: String,
    pub port: u16,
    pub cwd: Option<PathBuf>,
    pub exe: Option<PathBuf>,
    pub command_line: Vec<String>,
    pub parent_pids: Vec<u32>,
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalHttpProbeResult {
    pub url: String,
    pub protocol: LocalServiceProtocol,
    pub status_code: Option<u16>,
    pub content_type: Option<String>,
    pub title: Option<String>,
    pub browser_openable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalServiceProtocol {
    Http,
    Https,
    Unknown,
    NonHttp,
}

#[derive(Debug, Clone, Default)]
pub struct LocalServicesEngine;

impl LocalServicesEngine {
    pub fn new() -> Self {
        Self
    }

    pub async fn scan_listeners(&self) -> Result<Vec<LocalTcpListener>> {
        tokio::task::spawn_blocking(scanner::scan_listeners)
            .await
            .map_err(|e| {
                crate::EngineError::Processing(format!("local service scan task failed: {e}"))
            })?
    }

    pub async fn probe_http(&self, url: &str) -> Result<LocalHttpProbeResult> {
        probe::probe_http(url).await
    }

    pub async fn terminate_process(&self, pid: u32) -> Result<()> {
        tokio::task::spawn_blocking(move || scanner::terminate_process(pid))
            .await
            .map_err(|e| {
                crate::EngineError::Processing(format!("process terminate task failed: {e}"))
            })?
    }
}
