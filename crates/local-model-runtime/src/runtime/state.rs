use serde::{Deserialize, Serialize};

/// The full lifecycle state of a managed local model instance.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum LocalModelState {
    /// The model GGUF file has not been downloaded yet.
    NotInstalled,

    /// The llama-server binary is being downloaded.
    DownloadingBinary {
        model_id: String,
        /// 0.0 – 1.0
        progress: f32,
        #[serde(skip_serializing_if = "Option::is_none")]
        eta_seconds: Option<u64>,
    },

    /// The model GGUF file is being downloaded.
    DownloadingModel {
        model_id: String,
        progress: f32,
        #[serde(skip_serializing_if = "Option::is_none")]
        eta_seconds: Option<u64>,
    },

    /// Everything is downloaded but the server is not running.
    InstalledNotRunning { model_id: String },

    /// The llama-server process is being launched.
    Starting { model_id: String },

    /// The server is up and accepting requests.
    Running {
        /// The local HTTP endpoint, e.g. "http://127.0.0.1:8080".
        endpoint: String,
        /// The model id that is currently loaded.
        model_id: String,
    },

    /// The server encountered a fatal error.
    Failed { error: String },
}

impl LocalModelState {
    pub fn is_running(&self) -> bool {
        matches!(self, Self::Running { .. })
    }

    pub fn endpoint(&self) -> Option<&str> {
        if let Self::Running { endpoint, .. } = self {
            Some(endpoint.as_str())
        } else {
            None
        }
    }
}
