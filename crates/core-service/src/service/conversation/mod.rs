pub mod acp_factory;
pub mod catalog;
pub mod service;
pub mod store;
pub mod types;

#[cfg(test)]
mod tests;

pub use acp_factory::DefaultAgentProviderFactory;
pub use catalog::{
    builtin_catalog_specs, parse_followup_policy, terminal_catalog_from, CatalogPrefetchWorker,
    CatalogUpdated, FollowupPolicy, PREFETCH_POLL,
};
pub use service::ConversationService;
pub use store::ConversationStore;
pub use types::{
    ConversationClientEvent, ConversationClientPayload, ConversationIndexEntry, ConversationMeta,
    ConversationSnapshot, CreateConversationRequest, MessagePart, QueueItem, QueueItemStatus,
    RuntimeStatus, TurnStatus,
};

pub fn default_agent_data_dir() -> std::path::PathBuf {
    if let Ok(raw) = std::env::var("ATMOS_AGENT_DATA_DIR") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return std::path::PathBuf::from(trimmed);
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".atmos")
        .join("data")
        .join("agent")
}

pub fn default_conversations_dir() -> std::path::PathBuf {
    default_agent_data_dir().join("conversations")
}

pub fn catalog_probe_dir() -> std::path::PathBuf {
    default_agent_data_dir().join("catalog-probe")
}
