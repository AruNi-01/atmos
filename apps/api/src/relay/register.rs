//! One-shot control-plane registration via `ATMOS_REGISTER_TOKEN`.

use runtime_manifest::{register_computer, ServerIdentity};

pub async fn try_consume_register_token() -> Result<Option<ServerIdentity>, String> {
    let token = match std::env::var("ATMOS_REGISTER_TOKEN") {
        Ok(v) if !v.trim().is_empty() => v.trim().to_string(),
        _ => return Ok(None),
    };

    unsafe {
        std::env::remove_var("ATMOS_REGISTER_TOKEN");
    }

    let cp = std::env::var("ATMOS_CONTROL_PLANE_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| runtime_manifest::default_control_plane_url().to_string());

    let display_name = std::env::var("ATMOS_COMPUTER_DISPLAY_NAME")
        .ok()
        .filter(|s| !s.trim().is_empty());

    let identity = register_computer(
        &cp,
        &token,
        display_name.as_deref(),
    )
    .await?;

    tracing::info!(
        target: "atmos_relay",
        server_id = %identity.server_id,
        "registered computer with control plane (env token)"
    );

    Ok(Some(identity))
}
