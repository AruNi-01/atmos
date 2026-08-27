pub mod error;
pub mod event;
pub mod model;
pub mod session;

pub use error::{AgentProviderError, AgentResult};
pub use event::{
    AgentEvent, AgentPermissionOption, AgentPermissionRequest, AgentToolCall, TurnStop,
    UserMessageKind,
};
pub use model::{
    AgentMode, AgentModel, AgentModelCatalog, AgentThinkingSupport, CatalogSource, CatalogStatus,
    CatalogStrategyKind,
};
pub use session::{
    AgentCapabilities, AgentCatalogContext, AgentPersistenceHandle, AgentPrompt, AgentProvider,
    AgentProviderFactory, AgentSession, AgentSessionCommands, AgentSessionConfig,
    AgentSessionConfigUpdate, AgentSessionControl, AgentTurnHandle,
};
