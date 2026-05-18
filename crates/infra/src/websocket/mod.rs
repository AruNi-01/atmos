pub mod connection;
pub mod error;
pub mod handler;
pub mod manager;
pub mod message;
pub mod service;
pub mod subscription;

pub use connection::{generate_conn_id, ClientType, WsConnection};
pub use error::{WsError, WsResult};
pub use handler::WsMessageHandler;
pub use manager::{ConnectionInfo, WsManager};
pub use message::{
    AgentBehaviourSettingsUpdateRequest, AgentConfigGetRequest, AgentConfigSetRequest,
    AgentInstallRequest, AgentRegistryInstallRequest, AgentRegistryListRequest,
    AgentRegistryRemoveRequest, AppOpenRequest, CanvasAgentDispatchResultRequest,
    CanvasBoardResponse, CanvasBridgeRegisterRequest, CanvasBridgeUnregisterRequest,
    CanvasUpdateDefaultBoardRequest, CodeAgentCustomUpdateRequest, CustomAgentAddRequest,
    CustomAgentRemoveRequest, CustomAgentSetJsonRequest, FileTreeNode, FsCreateDirRequest,
    FsDeletePathRequest, FsDuplicatePathRequest, FsEntry, FsListDirRequest, FsListDirResponse,
    FsListProjectFilesRequest, FsListProjectFilesResponse, FsReadFileRequest, FsReadFileResponse,
    FsRenamePathRequest, FsSearchContentRequest, FsSearchContentResponse, FsSearchDirsRequest,
    FsSearchDirsResponse, FsValidateGitPathRequest, FsValidateGitPathResponse, FsWriteFileRequest,
    FsWriteFileResponse, FunctionSettingsUpdateRequest, GitBranchesResponse, GitChangedFile,
    GitChangedFilesRequest, GitChangedFilesResponse, GitCommitRequest, GitCommitResponse,
    GitDiscardUnstagedRequest, GitDiscardUntrackedRequest, GitFetchRequest, GitFileDiffRequest,
    GitFileDiffResponse, GitGenerateCommitMessageRequest, GitGenerateCommitMessageResponse,
    GitGetCommitCountRequest, GitGetHeadCommitRequest, GitGetStatusRequest, GitListBranchesRequest,
    GitLogRequest, GitPatchChunkRequest, GitPatchChunkResponse, GitPullRequest, GitPushRequest,
    GitPushResponse, GitRenameBranchRequest, GitStageRequest, GitStatusResponse, GitSyncRequest,
    GitUnstageRequest, GithubActionsDetailRequest, GithubActionsListRequest,
    GithubActionsRerunRequest, GithubCiOpenBrowserRequest, GithubCiStatusRequest,
    GithubIssueGetRequest, GithubIssueLabelPayload, GithubIssueListRequest, GithubIssuePayload,
    GithubPrCloseRequest, GithubPrCommentRequest, GithubPrCreateRequest, GithubPrDetailRequest,
    GithubPrDraftRequest, GithubPrFilesRequest, GithubPrGetRequest, GithubPrListRepoRequest,
    GithubPrListRequest, GithubPrMergeRequest, GithubPrOpenBrowserRequest, GithubPrPayload,
    GithubPrReadyRequest, GithubPrReopenRequest, GithubPrTimelinePageRequest,
    LlmProviderTestRequest, LlmProvidersUpdateRequest, LocalModelCustomAddRequest,
    LocalModelCustomDeleteRequest, LocalModelDeleteRequest, LocalModelDeleteRuntimeRequest,
    LocalModelDownloadRequest, LocalModelResolveHfUrlRequest, LocalModelStartRequest,
    LocalModelStateNotification, MessagePayload, ProjectCheckCanDeleteRequest,
    ProjectCreateRequest, ProjectDeleteProgressNotification, ProjectDeleteRequest,
    ProjectUpdateOrderRequest, ProjectUpdateRequest, ProjectUpdateTargetBranchRequest,
    ReviewAgentRunArtifactGetRequest, ReviewAgentRunCreateRequest, ReviewAgentRunFinalizeRequest,
    ReviewAgentRunListRequest, ReviewAgentRunSetStatusRequest, ReviewCommentCreateRequest,
    ReviewCommentListRequest, ReviewCommentUpdateStatusRequest, ReviewFileContentGetRequest,
    ReviewFileListRequest, ReviewFileSetReviewedRequest, ReviewMessageAddRequest,
    ReviewMessageDeleteRequest, ReviewMessageUpdateRequest, ReviewSessionActivateRequest,
    ReviewSessionArchiveRequest, ReviewSessionCloseRequest, ReviewSessionCreateRequest,
    ReviewSessionGetRequest, ReviewSessionListRequest, ReviewSessionRenameRequest,
    ScriptGetRequest, ScriptSaveRequest, SkillFile, SkillInfo, SkillPlacement, SkillsDeleteRequest,
    SkillsGetRequest, SkillsListRequest, SkillsListResponse, SkillsSetEnabledRequest,
    SyncSingleSystemSkillRequest, UsageAddProviderApiKeyRequest, UsageAllProvidersSwitchRequest,
    UsageAutoRefreshRequest, UsageDeleteProviderApiKeyRequest, UsageOverviewRequest,
    UsageProviderFooterCarouselRequest, UsageProviderManualSetupRequest,
    UsageProviderSwitchRequest, WorkspaceArchiveRequest, WorkspaceAttachmentPayload,
    WorkspaceConfirmTodosRequest, WorkspaceCreateRequest, WorkspaceDeleteProgressNotification,
    WorkspaceDeleteRequest, WorkspaceGitignoreSyncFailedNotification,
    WorkspaceImportGithubIssuesRequest, WorkspaceLabelCreateRequest, WorkspaceLabelDeleteRequest,
    WorkspaceLabelListRequest, WorkspaceLabelRestoreRequest, WorkspaceLabelUpdateRequest,
    WorkspaceListRequest, WorkspaceMarkVisitedRequest, WorkspacePinRequest,
    WorkspaceRetrySetupRequest, WorkspaceSetupContextNotification,
    WorkspaceSetupProgressNotification, WorkspaceSkipSetupScriptRequest,
    WorkspaceSkipSetupStepRequest, WorkspaceUnarchiveRequest, WorkspaceUnpinRequest,
    WorkspaceUpdateBranchRequest, WorkspaceUpdateLabelsRequest, WorkspaceUpdateNameRequest,
    WorkspaceUpdateOrderRequest, WorkspaceUpdatePinOrderRequest, WorkspaceUpdatePriorityRequest,
    WorkspaceUpdateWorkflowStatusRequest, WsAction, WsErrorPayload, WsEvent, WsMessage, WsRequest,
    WsResponse,
};
pub use service::WsService;
