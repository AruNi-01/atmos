//! ACP session runner - runs the ACP connection in a dedicated thread.

use std::path::PathBuf;
use std::sync::Arc;
use std::thread;

use agent_client_protocol::{self as acp, Agent};
use tokio::runtime::Builder;
use tokio::sync::{mpsc, oneshot};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};
use tracing::{error, info, warn};

use crate::acp_client::types::PermissionRequest;
use crate::acp_client::{AcpSessionEvent, AtmosAcpClient};
use crate::acp_client::tools::AcpToolHandler;
use crate::models::AgentLaunchSpec;

use super::process::spawn_agent;

/// Handle to an active ACP session - used to send prompts, receive events, and handle permissions
pub struct AcpSessionHandle {
    pub session_id: String,
    prompt_tx: mpsc::UnboundedSender<String>,
    event_rx: mpsc::UnboundedReceiver<AcpSessionEvent>,
    permission_rx: mpsc::UnboundedReceiver<(PermissionRequest, oneshot::Sender<bool>)>,
}

impl AcpSessionHandle {
    pub fn send_prompt(&self, message: String) {
        let _ = self.prompt_tx.send(message);
    }

    pub async fn recv_event(&mut self) -> Option<AcpSessionEvent> {
        self.event_rx.recv().await
    }

    pub fn try_recv_event(&mut self) -> Option<AcpSessionEvent> {
        self.event_rx.try_recv().ok()
    }

    /// Receive pending permission request (non-blocking)
    pub fn try_recv_permission(&mut self) -> Option<(PermissionRequest, oneshot::Sender<bool>)> {
        self.permission_rx.try_recv().ok()
    }

}

/// Run an ACP session in a dedicated thread with current_thread runtime.
/// Returns a handle for sending prompts and receiving events.
pub fn run_acp_session(
    session_id: String,
    launch_spec: AgentLaunchSpec,
    cwd: PathBuf,
    handler: Arc<dyn AcpToolHandler>,
    env_overrides: Option<std::collections::HashMap<String, String>>,
) -> Result<AcpSessionHandle, String> {
    let session_id_for_thread = session_id.clone();
    let (prompt_tx, mut prompt_rx) = mpsc::unbounded_channel::<String>();
    let (event_tx, event_rx) = mpsc::unbounded_channel::<AcpSessionEvent>();
    let (permission_tx, permission_rx) = mpsc::unbounded_channel();
    let event_tx_end = event_tx.clone();

    thread::Builder::new()
        .name(format!("acp-session-{}", &session_id_for_thread[..session_id_for_thread.len().min(8)]))
        .spawn(move || {
            let rt = Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("Failed to create ACP runtime");

            rt.block_on(async move {
                match run_session_inner(
                    &session_id_for_thread,
                    launch_spec,
                    &cwd,
                    handler,
                    env_overrides,
                    &mut prompt_rx,
                    event_tx.clone(),
                    permission_tx,
                )
                .await
                {
                    Ok(()) => info!("ACP session {} ended normally", session_id_for_thread),
                    Err(e) => {
                        error!("ACP session {} error: {}", session_id_for_thread, e);
                        let _ = event_tx_end.send(AcpSessionEvent::Error {
                            code: "SESSION_ERROR".to_string(),
                            message: e,
                            recoverable: false,
                        });
                    }
                }
                let _ = event_tx_end.send(AcpSessionEvent::SessionEnded);
            });
        })
        .map_err(|e| format!("Failed to spawn ACP thread: {}", e))?;

    Ok(AcpSessionHandle {
        session_id,
        prompt_tx,
        event_rx,
        permission_rx,
    })
}

async fn run_session_inner(
    _session_id: &str,
    launch_spec: AgentLaunchSpec,
    cwd: &PathBuf,
    handler: Arc<dyn AcpToolHandler>,
    env_overrides: Option<std::collections::HashMap<String, String>>,
    prompt_rx: &mut mpsc::UnboundedReceiver<String>,
    event_tx: mpsc::UnboundedSender<AcpSessionEvent>,
    permission_tx: mpsc::UnboundedSender<(PermissionRequest, oneshot::Sender<bool>)>,
) -> Result<(), String> {
    let (stdin, stdout, mut _child) = spawn_agent(&launch_spec, Some(cwd.clone()), env_overrides)
        .map_err(|e| format!("Failed to spawn agent: {}", e))?;

    let client = AtmosAcpClient::new(
        handler,
        cwd.clone(),
        permission_tx,
        event_tx.clone(),
    );

    let outgoing = stdin.compat_write();
    let incoming = stdout.compat();
    let cwd = cwd.clone();

    // Per agent-client-protocol rust-sdk docs: ClientSideConnection spawns futures via spawn_local.
    // spawn_local requires LocalSet context. Create conn and run everything INSIDE run_until.
    let local_set = tokio::task::LocalSet::new();
    local_set
        .run_until(async move {
            let (conn, handle_io) =
                acp::ClientSideConnection::new(client, outgoing, incoming, |fut| {
                    tokio::task::spawn_local(fut);
                });

            tokio::task::spawn_local(handle_io);

            conn.initialize(
                acp::InitializeRequest::new(acp::ProtocolVersion::V1)
                    .client_info(acp::Implementation::new("atmos", "0.1.0").title("ATMOS")),
            )
            .await
            .map_err(|e| format!("Initialize failed: {}", e))?;

            let response = conn
                .new_session(acp::NewSessionRequest::new(cwd))
                .await
                .map_err(|e| format!("New session failed: {}", e))?;

            let session_id_acp = response.session_id;

            while let Some(msg) = prompt_rx.recv().await {
                if msg.is_empty() {
                    break;
                }
                if let Err(e) = conn
                    .prompt(acp::PromptRequest::new(session_id_acp.clone(), vec![msg.into()]))
                    .await
                {
                    warn!("Prompt failed: {}", e);
                    let _ = event_tx.send(AcpSessionEvent::Error {
                        code: "PROMPT_FAILED".to_string(),
                        message: e.to_string(),
                        recoverable: true,
                    });
                }
            }

            Ok(())
        })
        .await
}
