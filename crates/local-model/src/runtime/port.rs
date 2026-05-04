use std::net::TcpListener;

use crate::error::{LocalModelError, Result};

/// The canonical TCP port that the managed `llama-server` binds to.
///
/// This must stay in sync with the `LocalManaged` provider endpoint resolution
/// in `crates/llm/src/config.rs` (`resolve_provider_by_id`). Using a fixed
/// port keeps the LLM client and the runtime in lockstep — picking a random
/// free port here would silently diverge from the hardcoded client URL.
pub const LOCAL_RUNTIME_PORT: u16 = 18080;

/// Reserve the canonical port for `llama-server`.
///
/// Probes the port by binding briefly. If it is already in use, returns a
/// descriptive error rather than falling back to a different port that the
/// LLM client wouldn't know how to reach.
pub fn reserve_runtime_port() -> Result<u16> {
    match TcpListener::bind(("127.0.0.1", LOCAL_RUNTIME_PORT)) {
        Ok(_listener) => {
            // Immediately drop the listener to avoid blocking the port
            drop(_listener);
            Ok(LOCAL_RUNTIME_PORT)
        }
        Err(err) => Err(LocalModelError::Runtime(format!(
            "Local model port {LOCAL_RUNTIME_PORT} is already in use ({err}); \
             stop the conflicting process and try again."
        ))),
    }
}
