pub mod error;
pub mod service;
pub mod types;
pub mod utils;

pub use error::{Result, ServiceError};
pub use service::agent::AgentService;
pub use service::agent_hooks::{AgentHooksService, AtmosContext};
pub use service::agent_status::{
    apply_host_event, chat_status_session_id, generate_attention_summary,
    parse_chat_status_session_id, provider_to_tool, resolve_workspace_agent_group_key,
    AgentAttentionLatch, AgentAttentionReason, AgentAttentionSummary, AgentOccupancy,
    AgentStatusContext, AgentStatusEvent, AgentStatusRecord, AgentStatusService, AgentStatusUpdate,
    AgentSurface, AgentToolType, AttentionSummaryPayload, AttentionSummarySettings,
    AttentionSummaryStatus, WorkspaceAgentGroupKey, WorkspaceAgentGroupSnapshot,
};

pub use service::agent_chat::{
    agent_chat_prefs_path, builtin_options_probe_plans, default_agent_data_dir, default_chats_dir,
    load_agent_chat_prefs, load_new_chat_configs, new_chat_configs_path, options_probe_dir,
    options_probe_plan_for, parse_followup_policy, save_agent_chat_prefs, save_last_registry_id,
    snapshot_from_create_fields, terminal_options_from, upsert_agent_new_chat_config,
    AgentChatEvent, AgentChatIndexEntry, AgentChatMeta, AgentChatOrigin, AgentChatPayload,
    AgentChatPrefs, AgentChatService, AgentChatSnapshot, AgentChatStore,
    AgentServiceOptionsResolver, CreateAgentChatRequest, DefaultAgentProviderFactory,
    FollowupPolicy, MessagePart, NewChatConfigsFile, OptionsPrefetchWorker, OptionsUpdated,
    QueueItem, QueueItemStatus, RuntimeStatus, TurnStatus, PREFETCH_POLL,
};
pub use service::automation::{
    ensure_builtin_terminal_agents_upgraded, AutomationAgentCapability, TerminalAgentCliStatus,
    TerminalAgentOption, TerminalAgentOptions, TerminalAgentOptionsSource,
    TerminalAgentOptionsStatus,
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
pub use service::center_layout::{
    center_layout_dir, load_center_layout, load_center_layout_from_dir, save_center_layout,
    save_center_layout_to_dir, CenterLayoutDocument, CENTER_LAYOUT_VERSION, MAX_SAVED_LAYOUTS,
    MAX_SPACES_PER_HOST,
};
pub use service::disk_analyzer::{DiskAnalyzerScanEvent, DiskAnalyzerService};
pub use service::group::{GroupDto, GroupMemberDto, GroupService};
pub use service::linear::{
    parse_list_options, parse_oauth_shell, LinearImportPayload, LinearLinkDto, LinearService,
    LinearStatusDto,
};
pub use service::local_services::{
    LocalServiceDto, LocalServiceKind, LocalServiceOwnerDto, LocalServiceProcessNodeDto,
    LocalServiceStatus, LocalServiceStopEscalationReason, LocalServiceStopMode,
    LocalServiceStopRequest, LocalServiceStopResponse, LocalServicesScanRequest,
    LocalServicesScanResponse, LocalServicesScope, LocalServicesService,
    LocalServicesUnavailableDto, LOCAL_SERVICES_AUTO_REFRESH_JOB_ID,
};
pub use service::message_push::MessagePushService;
pub use service::notification::NotificationService;
pub use service::project::{ProjectScripts, ProjectService, PROJECT_SCRIPTS_RELATIVE_PATH};
pub use service::resource_monitor::{
    ResourceAttributionStatus, ResourceDiskMetrics, ResourceHostCpuCore, ResourceHostMemoryMetrics,
    ResourceHostMetrics, ResourceMemoryAccounting, ResourceMonitorService, ResourceMonitorSnapshot,
    ResourceProcessMetrics, ResourceProjectMetrics, ResourceSessionMetrics, ResourceUsage,
    ResourceWorkspaceMetrics,
};
pub use service::review::ReviewService;
pub use service::terminal::{
    process_captured_pane_text, select_transcript, strip_ansi_and_controls, AttachSessionParams,
    CapturePanePlainTextParams, CaptureSideContextParams, CapturedPanePlainText,
    CapturedSideContext, CreateSessionParams, CreateSimpleSessionParams, SessionDetail,
    SessionType, TerminalKind, TerminalMessage, TerminalResponse, TerminalService,
    TerminalSideChatRecord, TerminalSideChatStatus, TranscriptBudget, UpsertTerminalSideChatParams,
};
pub use service::terminal_overview::build_terminal_overview_active_sessions_json;
pub use service::test::TestService;
pub use service::workspace::{WorkspaceDto, WorkspaceService};
pub use types::{
    GithubIssueAssigneePayload, GithubIssueLabelPayload, GithubIssuePayload, GithubPrPayload,
    GithubSearchItemPayload, GithubSearchPagePayload, SharedString, SkillFile, SkillInfo,
    SkillPlacement, WorkspaceAttachmentPayload,
};
