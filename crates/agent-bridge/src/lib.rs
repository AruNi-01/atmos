//! Atmos Agent Bridge protocol (APP-084).
//!
//! Pure types + in-memory mailbox/bags. No DB, no HTTP, no Mutex inside these types.
//! `core-service` serializes access and talks to Agent Chat / occupancy.
//!
//! Relay is a tunnel. This crate is the agent↔agent bus. Canvas/PT Design
//! `*_bridge_*` CLIs are a different product surface.

pub mod address;
pub mod busy;
pub mod catalog;
pub mod context;
pub mod delivery;
pub mod envelope;
pub mod error;
pub mod format;
pub mod mailbox;
pub mod state;

pub use address::{
    is_foreign_server, is_local_wildcard, server_ids_match, AgentAddress, LOCAL_SERVER_ID,
};
pub use busy::{plan_delivery, BusyPolicy, DeliveryPlan, Occupancy};
pub use catalog::{
    list_cursor, normalize_list_limit, page_live_sessions, split_list_cursor, terminal_provider_id,
    CatalogEntry, CatalogKind, ListResponse, LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT,
};
pub use context::{
    parse_context_ref, ContextBag, ContextBagSlices, ContextStore, ParsedContextRef,
};
pub use delivery::{
    plan_for_busy, resolve_live_targets, DeliveryAck, DeliveryStatus, LiveSession, TargetResolution,
};
pub use envelope::{
    BridgeMessage, ListRequest, MessageKind, ReplyRequest, SendRequest, SendTargets, StatusRequest,
    DEFAULT_TTL_MS,
};
pub use error::BridgeError;
pub use format::format_inject;
pub use mailbox::Mailbox;
pub use state::BridgeState;
