//! APP-016 Atmos Computer — outbound relay over Cloudflare Workers + DO.

pub(crate) mod external_events;
mod http_gateway;
mod ingest;
mod register;
pub mod relay_client;
mod supervisor;
mod terminal;

pub use register::try_consume_register_token;
pub use supervisor::RelaySupervisor;
