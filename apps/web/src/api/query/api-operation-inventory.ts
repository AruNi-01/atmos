/**
 * APP-035 · Operation inventory (M10)
 *
 * Typed development/test record of every API operation relevant to TanStack Query migration.
 * Production UI never imports this module. Used by `api-operation-inventory.test.ts`.
 *
 * Rules:
 *  - Each (domain, operation) pair must be unique.
 *  - "query" and "event" entries that drive cache invalidation must carry `queryKeyRoot`.
 *  - "event" entries must carry `invalidatedBy` or a `queryKeyRoot` (for setQueryData events).
 *  - "deferred" and "excluded" entries must carry a `rationale`.
 */

export type ApiOperationClass =
  | "query"
  | "mutation"
  | "event"
  | "stream"
  | "client-state"
  | "deferred"
  | "excluded";

export interface ApiMigrationEntry {
  domain: string;
  operation: string;
  transport: "rest" | "websocket-request" | "websocket-event" | "dedicated-stream";
  classification: ApiOperationClass;
  legacyOwner: string;
  /** Required for queries and cache-patching events. */
  queryKeyRoot?: string;
  /** Required for events (even if setQueryData — name the key root instead). */
  invalidatedBy?: string[];
  phase: "pilot" | "domain" | "extended" | "deferred" | "excluded";
  /** "planned" | "complete" | "deferred" | "excluded" */
  status: "planned" | "complete" | "deferred" | "excluded";
  /** Required for deferred/excluded entries. */
  rationale?: string;
}

export const apiOperationInventory = [
  // ──────────────────────────────────────────────────────────────────────────
  // PILOT: System diagnostics (REST / WS reads)
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "system",
    operation: "tmuxStatus",
    transport: "rest",
    classification: "query",
    legacyOwner: "system status queries / IntegrationsSettingsSection",
    queryKeyRoot: "queryKeys.computer.tmuxStatus",
    phase: "pilot",
    status: "complete",
  },
  {
    domain: "system",
    operation: "runtimeInfo",
    transport: "rest",
    classification: "query",
    legacyOwner: "system-query-options / IntegrationsSettingsSection",
    queryKeyRoot: "queryKeys.computer.runtimeInfo",
    phase: "pilot",
    status: "complete",
  },
  {
    domain: "system",
    operation: "ghCliStatus",
    transport: "rest",
    classification: "query",
    legacyOwner: "system-query-options / component local state",
    queryKeyRoot: "queryKeys.computer.ghCliStatus",
    phase: "pilot",
    status: "complete",
  },
  {
    domain: "system",
    operation: "terminalOverview",
    transport: "rest",
    classification: "query",
    legacyOwner: "system-query-options / component local state",
    queryKeyRoot: "queryKeys.computer.terminalOverview",
    phase: "pilot",
    status: "complete",
  },
  {
    domain: "system",
    operation: "wsConnections",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "system-query-options / component local state",
    queryKeyRoot: "queryKeys.computer.wsConnections",
    phase: "pilot",
    status: "complete",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // PILOT: Settings bootstrap
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "settings",
    operation: "settingsBootstrap",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "settingsBootstrapCache + Zustand settings slices",
    queryKeyRoot: "queryKeys.computer.settingsBootstrap",
    phase: "pilot",
    status: "complete",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // PILOT: Usage overview
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "quota",
    operation: "quotaOverviewGet",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "Footer / QuotaPopover component local state",
    queryKeyRoot: "queryKeys.computer.quotaOverview",
    phase: "pilot",
    status: "complete",
  },
  {
    domain: "quota",
    operation: "quotaOverviewUpdated",
    transport: "websocket-event",
    classification: "event",
    legacyOwner: "QuotaPopover.tsx / Footer.tsx onEvent subscriptions",
    queryKeyRoot: "queryKeys.computer.quotaOverview",
    invalidatedBy: ["quota_overview_updated"],
    phase: "pilot",
    status: "complete",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // CORE: Project / Workspace bootstrap
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "project",
    operation: "projectBootstrap",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useProjectStore.fetchProjects",
    queryKeyRoot: "queryKeys.computer.projectBootstrap",
    phase: "domain",
    status: "complete",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // CORE: Git (complete — APP-035 cutover)
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "git",
    operation: "gitStatus",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useGitStore / useGitInfoStore",
    queryKeyRoot: "queryKeys.computer.gitStatus",
    phase: "domain",
    status: "complete",
  },
  {
    domain: "git",
    operation: "gitBranches",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useGitStore / useGitInfoStore",
    queryKeyRoot: "queryKeys.computer.gitBranches",
    phase: "domain",
    status: "complete",
  },
  {
    domain: "git",
    operation: "gitChangedFiles",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useGitStore",
    queryKeyRoot: "queryKeys.computer.gitChangedFiles",
    phase: "domain",
    status: "complete",
  },
  {
    domain: "git",
    operation: "gitHistory",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "GitHistoryPanel / useGitHistory",
    queryKeyRoot: "queryKeys.computer.gitHistory",
    phase: "domain",
    status: "complete",
  },
  {
    domain: "git",
    operation: "gitFileDiff",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "DiffViewer / BaseCodeMirrorEditor (ChangesCodeView still batches imperatively)",
    queryKeyRoot: "queryKeys.computer.gitFileDiff",
    phase: "domain",
    status: "complete",
  },
  {
    domain: "git",
    operation: "gitCommit",
    transport: "websocket-request",
    classification: "mutation",
    legacyOwner: "useGitStore.commitChanges",
    queryKeyRoot: "queryKeys.computer.git",
    phase: "domain",
    status: "complete",
  },
  {
    domain: "git",
    operation: "gitPush",
    transport: "websocket-request",
    classification: "mutation",
    legacyOwner: "useGitStore.pushChanges",
    queryKeyRoot: "queryKeys.computer.git",
    phase: "domain",
    status: "complete",
  },
  {
    domain: "git",
    operation: "gitPull",
    transport: "websocket-request",
    classification: "mutation",
    legacyOwner: "useGitStore.pullChanges",
    queryKeyRoot: "queryKeys.computer.git",
    phase: "domain",
    status: "complete",
  },
  {
    domain: "git",
    operation: "gitStage",
    transport: "websocket-request",
    classification: "mutation",
    legacyOwner: "useGitStore.stageFiles",
    queryKeyRoot: "queryKeys.computer.git",
    phase: "domain",
    status: "complete",
  },
  {
    domain: "git",
    operation: "gitUnstage",
    transport: "websocket-request",
    classification: "mutation",
    legacyOwner: "useGitStore.unstageFiles",
    queryKeyRoot: "queryKeys.computer.git",
    phase: "domain",
    status: "complete",
  },
  {
    domain: "git",
    operation: "gitDiscard",
    transport: "websocket-request",
    classification: "mutation",
    legacyOwner: "useGitStore.discardUnstagedChanges / discardUntrackedFiles",
    queryKeyRoot: "queryKeys.computer.git",
    phase: "domain",
    status: "complete",
  },
  {
    domain: "files",
    operation: "fileTree",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useFileTreeStore",
    queryKeyRoot: "queryKeys.computer.files",
    phase: "domain",
    status: "complete",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // EXTENDED: Token usage
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "tokenUsage",
    operation: "tokenUsageOverviewGet",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "TokenUsagePage query",
    queryKeyRoot: "queryKeys.computer.tokenUsageOverview",
    phase: "extended",
    status: "complete",
  },
  {
    domain: "tokenUsage",
    operation: "tokenUsageUpdated",
    transport: "websocket-event",
    classification: "event",
    legacyOwner: "TokenUsagePage onEvent subscription",
    queryKeyRoot: "queryKeys.computer.tokenUsageOverview",
    invalidatedBy: ["token_usage_updated"],
    phase: "extended",
    status: "complete",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // EXTENDED: Skills
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "skills",
    operation: "skillsList",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "SkillsView component useState",
    queryKeyRoot: "queryKeys.computer.skillsList",
    phase: "extended",
    status: "complete",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // EXTENDED: Automations
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "automations",
    operation: "automationList",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useAutomations hook useState",
    queryKeyRoot: "queryKeys.computer.automationList",
    phase: "extended",
    status: "complete",
  },
  {
    domain: "automations",
    operation: "automationAgentCapabilities",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useAutomations hook useState",
    queryKeyRoot: "queryKeys.computer.automationAgentCapabilities",
    phase: "extended",
    status: "complete",
  },
  {
    domain: "automations",
    operation: "automationRunList",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useAutomationRunHistoryState via useAutomationRunListQuery",
    queryKeyRoot: "queryKeys.computer.automationRunList",
    phase: "extended",
    status: "complete",
  },
  {
    domain: "automations",
    operation: "automationDefinitionUpdated",
    transport: "websocket-event",
    classification: "event",
    legacyOwner: "useAutomationWebsocketSync",
    queryKeyRoot: "queryKeys.computer.automationList",
    invalidatedBy: ["automation_definition_updated"],
    phase: "extended",
    status: "complete",
  },
  {
    domain: "automations",
    operation: "automationRunUpdated",
    transport: "websocket-event",
    classification: "event",
    legacyOwner: "useAutomationWebsocketSync",
    queryKeyRoot: "queryKeys.computer.automationRunList",
    invalidatedBy: ["automation_run_updated"],
    phase: "extended",
    status: "complete",
  },
  {
    domain: "automations",
    operation: "automationRunOutput",
    transport: "websocket-event",
    classification: "stream",
    legacyOwner: "useAutomationWebsocketSync + live-run-output",
    phase: "extended",
    status: "complete",
    rationale: "Streaming incremental output; no Query snapshot. Buffer lives in live-run-output.ts.",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // EXTENDED: GitHub PR
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "github",
    operation: "githubRepoPrList",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "github-pr-cache module-level Map",
    queryKeyRoot: "queryKeys.computer.githubRepoPrList",
    phase: "extended",
    status: "complete",
  },
  {
    domain: "github",
    operation: "githubBranchPrList",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useGithubPRList local useState + github-pr-cache",
    queryKeyRoot: "queryKeys.computer.githubBranchPrList",
    phase: "extended",
    status: "complete",
  },
  {
    domain: "github",
    operation: "githubPrDetail",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useGithubPRDetail local useState",
    queryKeyRoot: "queryKeys.computer.githubPrDetail",
    phase: "extended",
    status: "complete",
  },
  {
    domain: "github",
    operation: "githubPrDetailSidebar",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useGithubPRDetailSidebar local useState",
    queryKeyRoot: "queryKeys.computer.githubPrDetailSidebar",
    phase: "extended",
    status: "complete",
  },
  {
    domain: "github",
    operation: "githubPrFiles",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useGithubPRFiles local useState",
    queryKeyRoot: "queryKeys.computer.githubPrFiles",
    phase: "extended",
    status: "complete",
  },
  {
    domain: "github",
    operation: "githubPrTimeline",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useGithubPRTimeline local useState + auto page chain",
    queryKeyRoot: "queryKeys.computer.githubPrTimeline",
    phase: "extended",
    status: "complete",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // EXTENDED: Review sessions
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "review",
    operation: "reviewSessionsList",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useReviewContext via useReviewSessionsQuery (comments still local useState)",
    queryKeyRoot: "queryKeys.computer.reviewSessions",
    phase: "extended",
    status: "complete",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // EXTENDED: Local services
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "localServices",
    operation: "localServicesScan",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "useLocalServicesStore Zustand",
    queryKeyRoot: "queryKeys.computer.localServicesScan",
    phase: "extended",
    status: "complete",
  },
  {
    domain: "localServices",
    operation: "localServicesUpdated",
    transport: "websocket-event",
    classification: "event",
    legacyOwner: "LocalServicesFooterItem refetchInterval",
    queryKeyRoot: "queryKeys.computer.localServicesScan",
    invalidatedBy: ["local_services_updated"],
    phase: "extended",
    status: "complete",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // EXTENDED: Local models
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "localModels",
    operation: "localModelList",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "settings panel component local state",
    queryKeyRoot: "queryKeys.computer.localModelList",
    phase: "extended",
    status: "complete",
  },
  {
    domain: "localModels",
    operation: "localModelStateChanged",
    transport: "websocket-event",
    classification: "event",
    legacyOwner: "settings panel component onEvent",
    queryKeyRoot: "queryKeys.computer.localModelList",
    invalidatedBy: ["local_model_state_changed"],
    phase: "extended",
    status: "complete",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // EXTENDED: Agent registry / custom agents
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "agentRegistry",
    operation: "agentRegistryList",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "agent manager hook/component local state",
    queryKeyRoot: "queryKeys.computer.agentRegistryList",
    phase: "extended",
    status: "complete",
  },
  {
    domain: "agentRegistry",
    operation: "customAgentList",
    transport: "websocket-request",
    classification: "query",
    legacyOwner: "agent manager hook/component local state",
    queryKeyRoot: "queryKeys.computer.customAgentList",
    phase: "extended",
    status: "complete",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // DEFERRED: ACP session list (infinite pagination, complex multi-root merge)
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "acpSessions",
    operation: "acpSessionList",
    transport: "websocket-request",
    classification: "deferred",
    legacyOwner: "useAcpSessionList hook refs/state",
    phase: "deferred",
    status: "deferred",
    rationale:
      "Multi-root infinite pagination with per-root cursor merging is not straightforward in useInfiniteQuery. Needs a dedicated design pass before cutover.",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // DEFERRED: Canvas
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "canvas",
    operation: "canvasBoardLoad",
    transport: "rest",
    classification: "query",
    legacyOwner: "use-canvas-board + /api/canvas/documents",
    phase: "extended",
    status: "complete",
    queryKeyRoot: "queryKeys.computer.canvas",
    rationale: "APP-037: file-backed documents via REST list/get under ~/.atmos/canvas.",
  },
  {
    domain: "canvas",
    operation: "canvasBoardSave",
    transport: "rest",
    classification: "mutation",
    legacyOwner: "use-canvas-board + PUT /api/canvas/documents/:file",
    phase: "extended",
    status: "complete",
    rationale: "APP-037: explicit save/save-as and autosave when path is set.",
  },
  {
    domain: "canvas",
    operation: "canvasAgentDispatch",
    transport: "websocket-event",
    classification: "deferred",
    legacyOwner: "canvas bridge lifecycle",
    phase: "deferred",
    status: "deferred",
    rationale: "No Query action; keep bridge lifecycle deferred with canvas.",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // DEFERRED: Agent Hooks
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "agentHooks",
    operation: "agentHookSessions",
    transport: "websocket-request",
    classification: "deferred",
    legacyOwner: "useAgentHooksStore",
    phase: "deferred",
    status: "deferred",
    rationale: "Requires separate live-lifecycle design; deferred in APP-035.",
  },
  {
    domain: "agentHooks",
    operation: "agentHookStateChanged",
    transport: "websocket-event",
    classification: "deferred",
    legacyOwner: "useAgentHooksStore",
    phase: "deferred",
    status: "deferred",
    rationale: "Deferred with agentHookSessions.",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // DEFERRED: Terminal layout
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "terminalLayout",
    operation: "terminalLayoutPersist",
    transport: "websocket-request",
    classification: "deferred",
    legacyOwner: "useTerminalStore",
    phase: "deferred",
    status: "deferred",
    rationale: "Requires separate layout/runtime design; client and server lifecycle are tightly coupled.",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // EXCLUDED: Connection / credential / session hydration
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "connection",
    operation: "connectionBootstrap",
    transport: "websocket-request",
    classification: "excluded",
    legacyOwner: "connection stores / connection-bootstrap libs",
    phase: "excluded",
    status: "excluded",
    rationale: "Imperative orchestration lifecycle; not a cacheable snapshot.",
  },
  {
    domain: "connection",
    operation: "tokenHydration",
    transport: "rest",
    classification: "excluded",
    legacyOwner: "atmos-access-token / hosted-connection-actions",
    phase: "excluded",
    status: "excluded",
    rationale: "Identity/session transition actions; not a cacheable snapshot.",
  },
  {
    domain: "connection",
    operation: "relayRegistration",
    transport: "rest",
    classification: "excluded",
    legacyOwner: "relay registration lifecycle",
    phase: "excluded",
    status: "excluded",
    rationale: "One-shot registration flow; not a cacheable read.",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // EXCLUDED: Terminal PTY / Agent Chat streams
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "terminal",
    operation: "terminalPty",
    transport: "dedicated-stream",
    classification: "excluded",
    legacyOwner: "Terminal PTY dedicated socket",
    phase: "excluded",
    status: "excluded",
    rationale: "Dedicated bidirectional PTY stream; not a cacheable read.",
  },
  {
    domain: "agentChat",
    operation: "agentChatStream",
    transport: "dedicated-stream",
    classification: "excluded",
    legacyOwner: "Agent Chat dedicated socket / event buffers",
    phase: "excluded",
    status: "excluded",
    rationale: "Long-lived streaming; not a cacheable read.",
  },
  {
    domain: "agentChat",
    operation: "automationOutputChunk",
    transport: "websocket-event",
    classification: "excluded",
    legacyOwner: "live-run-output.ts stream buffer",
    phase: "excluded",
    status: "excluded",
    rationale: "Incremental streaming output; Query snapshot would be incomplete.",
  },
  {
    domain: "agentChat",
    operation: "llmProviderTestChunk",
    transport: "websocket-event",
    classification: "excluded",
    legacyOwner: "mutation-local stream buffer",
    phase: "excluded",
    status: "excluded",
    rationale: "Streaming test output for mutation; not a snapshot.",
  },
  {
    domain: "agentChat",
    operation: "gitCommitMessageChunk",
    transport: "websocket-event",
    classification: "excluded",
    legacyOwner: "generation stream buffer",
    phase: "excluded",
    status: "excluded",
    rationale: "Streaming generation; not a snapshot.",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // EXCLUDED: Editor buffers / layout / navigation / terminal DOM cache
  // ──────────────────────────────────────────────────────────────────────────
  {
    domain: "editor",
    operation: "editorBuffers",
    transport: "rest",
    classification: "excluded",
    legacyOwner: "Zustand / React / DOM",
    phase: "excluded",
    status: "excluded",
    rationale: "Client state only; not a server snapshot.",
  },
  {
    domain: "editor",
    operation: "terminalDomCache",
    transport: "rest",
    classification: "excluded",
    legacyOwner: "useWorkspaceSurfaceCacheStore (APP-043)",
    phase: "excluded",
    status: "excluded",
    rationale:
      "APP-043 workspace surface cache (Active/Warm/Frozen DOM lifecycle). Client-only; must never be cleared by APP-035 query scope resets. clearAll runs on Atmos Computer / connection target switch, logout/session teardown, and existing target-reset paths via prepareConnectionTargetChange.",
  },
  {
    domain: "workspace",
    operation: "sessionListSnapshotCache",
    transport: "rest",
    classification: "excluded",
    legacyOwner: "useSessionListSnapshotStore",
    phase: "excluded",
    status: "excluded",
    rationale:
      "Session-long list paint snapshots (git status/branches/log, file tree, PR lists). Query still owns fetch/dedupe; this store survives Query GC for half-hour hops. Cleared on prepareConnectionTargetChange only.",
  },
  {
    domain: "editor",
    operation: "navigationState",
    transport: "rest",
    classification: "excluded",
    legacyOwner: "React router / nuqs",
    phase: "excluded",
    status: "excluded",
    rationale: "Client navigation state; not a server snapshot.",
  },
] as const satisfies readonly ApiMigrationEntry[];
