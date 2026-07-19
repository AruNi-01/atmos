pub mod error;
pub mod service;
pub mod types;
pub mod utils;

pub use error::{Result, ServiceError};
pub use service::agent::AgentService;
pub use service::agent_hooks::{AgentHookEvent, AgentHooksService};
pub use service::agent_session::{AgentSessionService, LazySessionSpec, ResumeNativeSessionSpec};
pub use service::automation::{
    AutomationAgentCapability, TerminalAgentModelCatalog, TerminalAgentModelCatalogSource,
    TerminalAgentModelCatalogStatus, TerminalAgentModelOption,
};
pub use service::automation::{
    AutomationArtifact, AutomationArtifactGetReq, AutomationArtifactKind, AutomationCancelRunReq,
    AutomationContinueInTerminalReq, AutomationContinueInTerminalResponse, AutomationCreateReq,
    AutomationDeleteReq, AutomationDetail, AutomationEvent, AutomationGetReq, AutomationList,
    AutomationListReq, AutomationRunDetail, AutomationRunGetReq, AutomationRunList,
    AutomationRunListReq, AutomationRunNowReq, AutomationRunStatus, AutomationScheduleInput,
    AutomationScheduleKind, AutomationSchedulePreviewReq, AutomationService, AutomationSummary,
    AutomationTargetInput, AutomationTargetKind, AutomationTriggerInput, AutomationTriggerKind,
    AutomationTriggerStatus, AutomationUpdateReq, ExternalTriggerOutcome,
    ExternalTriggerRejectReason, ExternalTriggerRejection, GithubEventFamily, GithubTriggerConfig,
    GithubTriggerEvent, GithubTriggerFilters, SchedulePreview,
};
pub use service::canvas::{
    AtmosCanvasFile, AtmosCanvasScript, CanvasDocumentFileDto, CanvasDocumentListItem,
    CanvasDocumentService, ATMOS_CANVAS_FILE_SCHEMA, CANVAS_FILE_EXTENSION,
    DEFAULT_PIN_DOCUMENT_FILE,
};
pub use service::canvas_agent_relay::{
    CanvasAgentDispatchOutcome, CanvasAgentRelay, CanvasBridgeClientSummary, CanvasBridgeStatus,
    CompleteDispatchResult, DuplicateRequestError, ResolveTarget, DEFAULT_RELAY_TIMEOUT_MS,
    MAX_RELAY_TIMEOUT_MS,
};
pub use service::local_services::{
    LocalServiceDto, LocalServiceKind, LocalServiceOwnerDto, LocalServiceStatus,
    LocalServiceStopRequest, LocalServiceStopResponse, LocalServicesScanRequest,
    LocalServicesScanResponse, LocalServicesScope, LocalServicesService,
    LocalServicesUnavailableDto,
};
pub use service::message_push::MessagePushService;
pub use service::notification::NotificationService;
pub use service::project::ProjectService;
pub use service::review::ReviewService;
pub use service::terminal::{
    AttachSessionParams, CaptureSideContextParams, CapturedSideContext, CreateSessionParams,
    CreateSimpleSessionParams, SessionDetail, SessionType, TerminalKind, TerminalMessage,
    TerminalResponse, TerminalService, TerminalSideChatRecord, TerminalSideChatStatus,
    UpsertTerminalSideChatParams,
};
pub use service::terminal_overview::build_terminal_overview_active_sessions_json;
pub use service::test::TestService;
pub use service::workspace::{WorkspaceDto, WorkspaceService};
pub use types::{
    GithubIssueLabelPayload, GithubIssuePayload, GithubPrPayload, SharedString, SkillFile,
    SkillInfo, SkillPlacement, WorkspaceAttachmentPayload,
};
