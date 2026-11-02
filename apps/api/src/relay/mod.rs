//! APP-016 Atmos Computer — outbound relay to the Atmos Relay edge.

pub(crate) mod e2ee;
pub(crate) mod external_events;
mod frame_e2ee;
mod http_gateway;
pub(crate) mod http_stream;
mod ingest;
mod register;
pub mod relay_client;
mod supervisor;
mod terminal;

pub use register::try_consume_register_token;
pub use supervisor::RelaySupervisor;
