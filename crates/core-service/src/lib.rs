pub mod error;
pub mod service;
pub mod types;
pub mod utils;

pub use error::{Result, ServiceError};
pub use service::agent::AgentService;
pub use service::agent_hooks::{AgentHookEvent, AgentHooksService};
pub use service::agent_session::{AgentSessionService, LazySessionSpec};
pub use service::automation::AutomationAgentCapability;
pub use service::automation::{
    AutomationArtifact, AutomationArtifactGetReq, AutomationArtifactKind, AutomationCancelRunReq,
    AutomationCreateReq, AutomationDeleteReq, AutomationDetail, AutomationEvent, AutomationGetReq,
    AutomationList, AutomationListReq, AutomationRunDetail, AutomationRunGetReq, AutomationRunList,
    AutomationRunListReq, AutomationRunNowReq, AutomationRunStatus, AutomationScheduleInput,
    AutomationScheduleKind, AutomationSchedulePreviewReq, AutomationService, AutomationSummary,
    AutomationTargetInput, AutomationTargetKind, AutomationTriggerInput, AutomationTriggerKind,
    AutomationTriggerStatus, AutomationUpdateReq, ExternalTriggerOutcome,
    ExternalTriggerRejectReason, ExternalTriggerRejection, GithubEventFamily, GithubTriggerConfig,
    GithubTriggerEvent, GithubTriggerFilters, SchedulePreview,
};
pub use service::canvas::{CanvasBoardDto, CanvasService, SaveCanvasBoardReq};
pub use service::canvas_agent_relay::{
    CanvasAgentDispatchOutcome, CanvasAgentRelay, CanvasBridgeClientSummary, CanvasBridgeStatus,
    CompleteDispatchResult, DuplicateRequestError, ResolveTarget, DEFAULT_RELAY_TIMEOUT_MS,
    MAX_RELAY_TIMEOUT_MS,
};
pub use service::message_push::MessagePushService;
pub use service::notification::NotificationService;
pub use service::project::ProjectService;
pub use service::review::ReviewService;
pub use service::terminal::{
    AttachSessionParams, CreateSessionParams, CreateSimpleSessionParams, SessionDetail,
    SessionType, TerminalMessage, TerminalResponse, TerminalService,
};
pub use service::terminal_overview::build_terminal_overview_active_sessions_json;
pub use service::test::TestService;
pub use service::workspace::{WorkspaceDto, WorkspaceService};
pub use types::{
    GithubIssueLabelPayload, GithubIssuePayload, GithubPrPayload, SharedString, SkillFile,
    SkillInfo, SkillPlacement, WorkspaceAttachmentPayload,
};
