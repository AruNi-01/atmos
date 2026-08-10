use reqwest::Method;
use serde::Serialize;
use serde_json::{Map, Value};

use core_service::{Result, ServiceError};
use runtime_manager::{read_computer_client_settings, resolve_relay_proxy_auth};

pub struct RelayRequest {
    pub client: RelayClient,
    pub payload: Map<String, Value>,
}

pub struct RelayClient {
    base_url: String,
    device_credential: String,
    relay_secret_key: Option<String>,
    client: reqwest::Client,
}

impl RelayRequest {
    pub fn from_value_with_settings_fallback(value: Value) -> Result<Self> {
        let Value::Object(mut payload) = value else {
            return Err(ServiceError::Validation(
                "Expected relay request object.".to_string(),
            ));
        };

        let relay_url = take_optional_string(&mut payload, "relay_url");
        let device_credential = take_optional_string(&mut payload, "device_credential")
            .or_else(|| take_optional_string(&mut payload, "access_token"));
        let relay_secret_key = take_optional_string(&mut payload, "relay_secret_key");

        let settings = read_computer_client_settings().map_err(|error| {
            ServiceError::Processing(format!("Computer relay settings read failed: {error}"))
        })?;

        let resolved = resolve_relay_proxy_auth(
            relay_url.as_deref(),
            device_credential.as_deref(),
            relay_secret_key.as_deref(),
            settings.as_ref(),
        )
        .map_err(ServiceError::Validation)?;

        let device_credential = resolved.device_credential.ok_or_else(|| {
            ServiceError::Validation(
                "Device credential is not configured. Sign in to Atmos Hub and trust this device (Settings → Account), then try again.".to_string(),
            )
        })?;

        Ok(Self {
            client: RelayClient::new(
                &resolved.relay_url,
                &device_credential,
                resolved.relay_secret_key.as_deref(),
            )?,
            payload,
        })
    }
}

impl RelayClient {
    fn new(
        relay_url: &str,
        device_credential: &str,
        relay_secret_key: Option<&str>,
    ) -> Result<Self> {
        let device_credential = device_credential.trim();
        if device_credential.len() < 32 {
            return Err(ServiceError::Validation(
                "Device credential is missing or too short.".to_string(),
            ));
        }
        let relay_secret_key = relay_secret_key
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);

        let base_url = relay_url.trim().trim_end_matches('/').to_string();
        if !(base_url.starts_with("https://") || base_url.starts_with("http://")) {
            return Err(ServiceError::Validation(
                "relay_url must be an HTTP(S) URL.".to_string(),
            ));
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|error| {
                ServiceError::Processing(format!("Relay client init failed: {error}"))
            })?;

        Ok(Self {
            base_url,
            device_credential: device_credential.to_string(),
            relay_secret_key,
            client,
        })
    }

    pub async fn json<B>(&self, method: Method, path: &str, body: Option<&B>) -> Result<Value>
    where
        B: Serialize + ?Sized,
    {
        let mut request = self
            .client
            .request(method, format!("{}{}", self.base_url, path))
            .bearer_auth(&self.device_credential)
            .header(reqwest::header::ACCEPT, "application/json");

        if let Some(secret) = &self.relay_secret_key {
            request = request.header("X-Atmos-Relay-Secret", secret);
        }

        if let Some(body) = body {
            request = request.json(body);
        }

        let response = request
            .send()
            .await
            .map_err(|error| ServiceError::Processing(format!("Relay request failed: {error}")))?;
        let status = response.status();
        let text = response.text().await.map_err(|error| {
            ServiceError::Processing(format!("Relay response read failed: {error}"))
        })?;
        let data = serde_json::from_str::<Value>(&text).map_err(|error| {
            if status.is_success() {
                ServiceError::Processing(format!("Relay returned invalid JSON: {error}"))
            } else {
                ServiceError::Processing(format!("relay_request_failed (HTTP {})", status.as_u16()))
            }
        })?;
        if !status.is_success() {
            let code = data
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("relay_request_failed");
            return Err(ServiceError::Processing(format!(
                "{code} (HTTP {})",
                status.as_u16()
            )));
        }
        Ok(data)
    }
}

fn take_optional_string(payload: &mut Map<String, Value>, key: &str) -> Option<String> {
    match payload.remove(key) {
        Some(Value::String(value)) if !value.trim().is_empty() => Some(value.trim().to_string()),
        _ => None,
    }
}
