use crate::error::{LocalModelError, Result};

/// The canonical TCP port that the managed `llama-server` binds to.
pub const LOCAL_RUNTIME_PORT: u16 = 18080;

/// Probe the canonical port for `llama-server`.
pub fn runtime_port() -> Result<u16> {
    match std::net::TcpListener::bind(("127.0.0.1", LOCAL_RUNTIME_PORT)) {
        Ok(listener) => {
            drop(listener);
            Ok(LOCAL_RUNTIME_PORT)
        }
        Err(err) => Err(LocalModelError::Runtime(format!(
            "Local model port {LOCAL_RUNTIME_PORT} is already in use ({err}); \
             stop the conflicting process and try again."
        ))),
    }
}
