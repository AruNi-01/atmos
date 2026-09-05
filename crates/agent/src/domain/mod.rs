pub mod error;
pub mod event;
pub mod model;
pub mod session;
pub mod tool_kind;

pub use error::{AgentProviderError, AgentResult};
pub use event::{
    AgentAvailableCommand, AgentEvent, AgentPermissionOption, AgentPermissionRequest,
    AgentToolCall, TurnStop, UserMessageKind,
};
pub use model::{
    AgentMode, AgentModel, AgentModelCatalog, AgentThinkingSupport, CatalogSource, CatalogStatus,
    CatalogStrategyKind,
};
pub use session::{
    AgentCapabilities, AgentCatalogContext, AgentPersistenceHandle, AgentPrompt, AgentProvider,
    AgentProviderFactory, AgentRuntime, AgentRuntimeCommands, AgentRuntimeConfig,
    AgentRuntimeConfigUpdate, AgentRuntimeControl, AgentTurnHandle,
};
pub use tool_kind::{
    classify_tool, deserialize_tool_kind, is_ask_user_tool, is_exit_plan_tool,
    is_generic_tool_label, mode_from_sync_input, plan_from_tool_input, questions_from_tool_input,
    thinking_text, AgentToolKind, ClassifiedTool,
};
