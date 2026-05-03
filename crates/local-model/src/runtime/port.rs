use std::net::TcpListener;

use crate::error::{LocalModelError, Result};

const PORT_RANGE_START: u16 = 18080;
const PORT_RANGE_END: u16 = 18200;

/// Find a free TCP port in the reserved range for llama-server.
pub fn find_free_port() -> Result<u16> {
    for port in PORT_RANGE_START..=PORT_RANGE_END {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }
    Err(LocalModelError::Runtime(format!(
        "No free port found in range {PORT_RANGE_START}–{PORT_RANGE_END}"
    )))
}
