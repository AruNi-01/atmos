use reqwest::Method;
use serde::Serialize;
use serde_json::{Map, Value};

use core_service::{Result, ServiceError};

pub struct RelayControlRequest {
    pub client: RelayControlClient,
    pub payload: Map<String, Value>,
}

pub struct RelayControlClient {
    base_url: String,
    access_token: String,
    client: reqwest::Client,
}

impl RelayControlRequest {
    pub fn from_value(value: Value) -> Result<Self> {
        let Value::Object(mut payload) = value else {
            return Err(ServiceError::Validation(
                "Expected relay control request object.".to_string(),
            ));
        };
        let control_plane_url = take_required_string(&mut payload, "control_plane_url")?;
        let access_token = take_required_string(&mut payload, "access_token")?;
        Ok(Self {
            client: RelayControlClient::new(&control_plane_url, &access_token)?,
            payload,
        })
    }
}

impl RelayControlClient {
    fn new(control_plane_url: &str, access_token: &str) -> Result<Self> {
        let access_token = access_token.trim();
        if access_token.len() < 32 {
            return Err(ServiceError::Validation(
                "Relay Access Token is missing or too short.".to_string(),
            ));
        }

        let base_url = control_plane_url.trim().trim_end_matches('/').to_string();
        if !(base_url.starts_with("https://") || base_url.starts_with("http://")) {
            return Err(ServiceError::Validation(
                "control_plane_url must be an HTTP(S) URL.".to_string(),
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
