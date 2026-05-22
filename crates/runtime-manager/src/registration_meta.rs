//! JSON blob stored on control-plane `computers.registration_meta` and local `relay_identity.json`.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RegistrationMeta {
    /// Registration client: `web` | `desktop` | `cli` | `local-web-runtime` | `env` | …
    pub via: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

impl RegistrationMeta {
    pub fn new(via: impl Into<String>, version: Option<impl Into<String>>) -> Self {
        Self {
            via: via.into(),
            version: version.map(Into::into),
        }
    }

    pub fn to_value(&self) -> Value {
        serde_json::to_value(self).unwrap_or(Value::Null)
    }

    pub fn to_json_string(&self) -> Result<String, String> {
        serde_json::to_string(self).map_err(|e| format!("registration_meta serialize: {e}"))
    }

    pub fn from_value(value: &Value) -> Result<Self, String> {
        serde_json::from_value(value.clone()).map_err(|e| format!("registration_meta parse: {e}"))
    }

    pub fn from_json_str(raw: &str) -> Result<Self, String> {
        let value: Value =
            serde_json::from_str(raw).map_err(|e| format!("registration_meta json: {e}"))?;
        Self::from_value(&value)
    }
}
