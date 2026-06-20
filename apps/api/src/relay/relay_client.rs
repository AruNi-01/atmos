use reqwest::Method;
use serde::Serialize;
use serde_json::{Map, Value};

use core_service::{Result, ServiceError};

pub struct RelayRequest {
    pub client: RelayClient,
    pub payload: Map<String, Value>,
}

pub struct RelayClient {
    base_url: String,
    access_token: String,
    relay_secret_key: Option<String>,
    client: reqwest::Client,
}

impl RelayRequest {
    pub fn from_value(value: Value) -> Result<Self> {
        let Value::Object(mut payload) = value else {
            return Err(ServiceError::Validation(
                "Expected relay request object.".to_string(),
            ));
        };
        let relay_url = take_required_string(&mut payload, "relay_url")?;
        let access_token = take_required_string(&mut payload, "access_token")?;
        let relay_secret_key = take_optional_string(&mut payload, "relay_secret_key");
        Ok(Self {
            client: RelayClient::new(&relay_url, &access_token, relay_secret_key.as_deref())?,
            payload,
        })
    }
}

impl RelayClient {
    fn new(relay_url: &str, access_token: &str, relay_secret_key: Option<&str>) -> Result<Self> {
        let access_token = access_token.trim();
        if access_token.len() < 32 {
            return Err(ServiceError::Validation(
                "Relay Access Token is missing or too short.".to_string(),
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
            access_token: access_token.to_string(),
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
            .bearer_auth(&self.access_token)
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

fn take_required_string(payload: &mut Map<String, Value>, key: &str) -> Result<String> {
    match payload.remove(key) {
        Some(Value::String(value)) if !value.trim().is_empty() => Ok(value.trim().to_string()),
        _ => Err(ServiceError::Validation(format!("{key} is required."))),
    }
}

fn take_optional_string(payload: &mut Map<String, Value>, key: &str) -> Option<String> {
    match payload.remove(key) {
        Some(Value::String(value)) if !value.trim().is_empty() => Some(value.trim().to_string()),
        _ => None,
    }
}
