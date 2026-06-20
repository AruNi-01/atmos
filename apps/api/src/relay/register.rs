//! One-shot relay registration via `ATMOS_REGISTER_TOKEN`.

use runtime_manager::{default_relay_url, register_computer, RegistrationMeta, ServerIdentity};
pub async fn try_consume_register_token() -> Result<Option<ServerIdentity>, String> {
    let token = match std::env::var("ATMOS_REGISTER_TOKEN") {
        Ok(v) if !v.trim().is_empty() => v.trim().to_string(),
        _ => return Ok(None),
    };

    let relay_url = std::env::var("ATMOS_RELAY_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| default_relay_url().to_string());
    let relay_secret_key = std::env::var("ATMOS_RELAY_SECRET_KEY")
        .ok()
        .filter(|s| !s.trim().is_empty());

    let display_name = std::env::var("ATMOS_COMPUTER_DISPLAY_NAME")
        .ok()
        .filter(|s| !s.trim().is_empty());

    let via = std::env::var("ATMOS_REGISTRATION_VIA")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "env".to_string());
    let version = std::env::var("ATMOS_REGISTRATION_VERSION")
        .ok()
        .filter(|s| !s.trim().is_empty());
    let meta = RegistrationMeta::new(via, version).to_value();

    let identity = register_computer(
        &relay_url,
        &token,
        relay_secret_key.as_deref(),
        display_name.as_deref(),
        Some(meta),
    )
    .await?;

    tracing::info!(
        target: "atmos_relay",
        server_id = %identity.server_id,
        "registered computer with relay (env token)"
    );

    Ok(Some(identity))
}
