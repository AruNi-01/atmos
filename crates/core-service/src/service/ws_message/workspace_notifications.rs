use super::*;

impl WsMessageService {
    pub(super) async fn send_workspace_setup_progress(
        manager: &Arc<infra::WsManager>,
        _conn_id: &str,
        payload: WorkspaceSetupProgressNotification,
    ) {
        let message = WsMessage::notification(WsEvent::WorkspaceSetupProgress, json!(payload));
        // Workspace setup is a background workflow that can outlive the WebSocket
        // connection that triggered it. Broadcast by workspace_id instead of
        // pinning updates to a potentially stale conn_id from the original request.
        let _ = manager.broadcast(&message).await;
    }

    pub(super) async fn send_workspace_delete_progress(
        manager: &Arc<infra::WsManager>,
        payload: WorkspaceDeleteProgressNotification,
    ) {
        let message = WsMessage::notification(WsEvent::WorkspaceDeleteProgress, json!(payload));
        let _ = manager.broadcast(&message).await;
    }
}
