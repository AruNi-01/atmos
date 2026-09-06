/**
 * Centralized nuqs search param definitions.
 *
 * All URL-persisted state (tabs, dialogs, searches, filters) is declared here
 * so that parsers can be shared between client hooks and (optionally) server
 * loaders.
 */

import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
} from "nuqs";

// ---------------------------------------------------------------------------
// CenterStage – tab & wiki page
// ---------------------------------------------------------------------------
export type FixedTab =
  | "overview"
  | "terminal"
  | "wiki"
  | "project-wiki"
  | "code-review"
  | "simulator"
  | "git-history"
  | "changes"
  | "review"
  | "run"
  | "github"
  | "files"
  | "pt-design";

export const centerStageParams = {
  /** One-shot deep link. Live tab chrome lives in lastTabByContext, not the URL. */
  tab: parseAsString,
  /** One-shot wiki page deep link. */
  wikiPage: parseAsString,
  newWorkspace: parseAsBoolean.withDefault(false),
  canvas: parseAsBoolean.withDefault(false),
  /** One-shot: focus terminal pane by tmux window name. */
  terminalTmux: parseAsString,
  /** One-shot: open/focus a terminal side chat on the source pane. */
  sideChat: parseAsString,
};

// ---------------------------------------------------------------------------
// GlobalSearch
// ---------------------------------------------------------------------------
export type SearchTab = "app" | "files" | "code";

export const globalSearchParams = {
  search: parseAsBoolean.withDefault(false),
  searchTab: parseAsStringEnum<SearchTab>(["app", "files", "code"]).withDefault("app"),
};

// ---------------------------------------------------------------------------
// WorkspacesManagement – recent / archived tab
// ---------------------------------------------------------------------------
export type WorkspacesView = "recent" | "archived";

export const workspacesParams = {
  view: parseAsStringEnum<WorkspacesView>(["recent", "archived"]).withDefault("recent"),
  q: parseAsString.withDefault(""),
};

// ---------------------------------------------------------------------------
// AutomationsManagement – page state, selected definition, search, filters
// ---------------------------------------------------------------------------
export type AutomationsView = "list" | "create" | "edit" | "history";
export type AutomationsListTab = "automations" | "history";
export type AutomationEnvironmentFilter =
  | "project"
  | "workspace"
  | "new_workspace"
  | "standalone";
export type AutomationTriggerFilter =
  | "manual"
  | "github"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "cron";
export type AutomationStateFilter = "enabled" | "paused";
export type AutomationRunStatusFilter =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export const automationsParams = {
  view: parseAsStringEnum<AutomationsView>(["list", "create", "edit", "history"])
    .withDefault("list")
    .withOptions({ history: "push" }),
  tab: parseAsStringEnum<AutomationsListTab>(["automations", "history"]).withDefault(
    "automations",
  ),
  automation: parseAsString.withDefault(""),
  run: parseAsString.withDefault(""),
  environments: parseAsArrayOf(
    parseAsStringEnum<AutomationEnvironmentFilter>([
      "project",
      "workspace",
      "new_workspace",
      "standalone",
    ]),
  ).withDefault([]),
  triggers: parseAsArrayOf(
    parseAsStringEnum<AutomationTriggerFilter>([
      "manual",
      "github",
      "hourly",
      "daily",
      "weekly",
      "monthly",
      "cron",
    ]),
  ).withDefault([]),
  states: parseAsArrayOf(
    parseAsStringEnum<AutomationStateFilter>(["enabled", "paused"]),
  ).withDefault([]),
  runStatuses: parseAsArrayOf(
    parseAsStringEnum<AutomationRunStatusFilter>([
      "running",
      "completed",
      "failed",
      "cancelled",
      "interrupted",
    ]),
  ).withDefault([]),
  runAutomations: parseAsArrayOf(parseAsString).withDefault([]),
  q: parseAsString.withDefault(""),
};

// ---------------------------------------------------------------------------
// SkillsView – scope filter & search
// ---------------------------------------------------------------------------
export type SkillsTab = "installed" | "market" | "resources";
export type ScopeFilter = "all" | "global" | "project" | "system";

export const skillsParams = {
  tab: parseAsStringEnum<SkillsTab>(["installed", "market", "resources"]).withDefault("installed"),
  filter: parseAsStringEnum<ScopeFilter>(["all", "global", "project", "system"]).withDefault("all"),
  projects: parseAsString.withDefault(""),
  q: parseAsString.withDefault(""),
};

// ---------------------------------------------------------------------------
// AgentManager – tab & search
// ---------------------------------------------------------------------------
export type AgentTab = "native" | "acp" | "custom";
export type AgentManagerView = "manager" | "sessions";

export const agentManagerParams = {
  agentView: parseAsStringEnum<AgentManagerView>(["manager", "sessions"]).withDefault("manager"),
  // Old `registry` / `installed` query values are dropped and default to `acp`.
  agentTab: parseAsStringEnum<AgentTab>(["native", "acp", "custom"]).withDefault("acp"),
  agentQ: parseAsString.withDefault(""),
};

// ---------------------------------------------------------------------------
// Skills Modal (Header) – tab
// ---------------------------------------------------------------------------
export type SkillsModalTab = "my-skills" | "marketplace";

export const skillsModalParams = {
  skillsModal: parseAsBoolean.withDefault(false),
  skillsModalTab: parseAsStringEnum<SkillsModalTab>(["my-skills", "marketplace"]).withDefault("my-skills"),
};

export const llmProvidersModalParams = {
  llmProvidersModal: parseAsBoolean.withDefault(false),
};

export type SettingsModalTab =
  | "general"
  | "account"
  | "interface"
  | "editor"
  | "terminal"
  | "workspace"
  | "agents"
  | "models"
  | "notifications"
  | "remote-access"
  | "apps"
  | "privacy"
  | "keyboard";

export const settingsModalParams = {
  settingsModal: parseAsBoolean.withDefault(false),
  activeSettingTab: parseAsStringEnum<SettingsModalTab>([
    "general",
    "account",
    "interface",
    "editor",
    "terminal",
    "workspace",
    "agents",
    "models",
    "notifications",
    "remote-access",
    "apps",
    "privacy",
    "keyboard",
  ]).withOptions({ history: "replace" }),
};

// ---------------------------------------------------------------------------
// Agent Chat Panel (global)
// ---------------------------------------------------------------------------
export const agentChatParams = {
  chat: parseAsBoolean.withDefault(false),
  agent: parseAsString.withDefault(""),
  session: parseAsString.withDefault(""),
  sessionCwd: parseAsString.withDefault(""),
  handoffToken: parseAsString.withDefault(""),
};

// ---------------------------------------------------------------------------
// GitHub hub – create pull request dialog
// ---------------------------------------------------------------------------
export const createPrDialogParams = {
  createPr: parseAsBoolean.withDefault(false),
};

// ---------------------------------------------------------------------------
// LeftSidebar – tab
// ---------------------------------------------------------------------------
export type LeftSidebarTab = "projects";

export const leftSidebarParams = {
  lsTab: parseAsStringEnum<LeftSidebarTab>(["projects"]).withDefault("projects"),
  lsTask: parseAsBoolean.withDefault(false),
  lsTaskQ: parseAsString.withDefault(""),
};

// ---------------------------------------------------------------------------
// Preview toolbar – view mode & toolbar toggles
// ---------------------------------------------------------------------------
export type PreviewViewMode = "desktop" | "mobile";

export const previewToolbarParams = {
  pvView: parseAsStringEnum<PreviewViewMode>(["desktop", "mobile"]).withDefault("desktop"),
  pvToolbar: parseAsBoolean.withDefault(false),
  pvPick: parseAsBoolean.withDefault(false),
};

export const previewUrlParams = {
  pvUrl: parseAsString.withDefault(""),
};

// ---------------------------------------------------------------------------
// ChatSessions – filter & search
// ---------------------------------------------------------------------------
export const chatSessionsParams = {
  q: parseAsString.withDefault(""),
  registry_id: parseAsString.withDefault(""),
};

// ---------------------------------------------------------------------------
// Tasks page – source tab, Atmos filters, GitHub list state
// ---------------------------------------------------------------------------
export type TaskSourceTab = "atmos" | "github" | "linear";
export type TaskGithubKindParam = "issues" | "prs";
export type TaskGithubStateParam = "all" | "open" | "closed";
/** GitHub list sort — matches github.com PR/Issue list sort menu. */
export type TaskGithubSortParam =
  | "created-desc"
  | "created-asc"
  | "comments-desc"
  | "comments-asc"
  | "updated-desc"
  | "updated-asc"
  | "best-match";
export type TaskGroupingModeParam =
  | "project"
  | "group"
  | "status"
  | "time"
  | "label"
  | "priority"
  | "agent";

const parseAsStringList = parseAsArrayOf(parseAsString).withDefault([]);

export const taskParams = {
  /** Atmos board vs GitHub issues/PRs. */
  taskSource: parseAsStringEnum<TaskSourceTab>(["atmos", "github", "linear"]).withDefault("atmos"),
  /** Atmos kanban column grouping (also mirrored to function settings). */
  taskGroupBy: parseAsStringEnum<TaskGroupingModeParam>([
    "project",
    "group",
    "status",
    "time",
    "label",
    "priority",
    "agent",
  ]).withDefault("status"),
  /** Atmos board filters (comma-separated ids / enum values). */
  taskStatuses: parseAsStringList,
  taskPriorities: parseAsStringList,
  taskLabels: parseAsStringList,
  taskProjects: parseAsStringList,
  taskGroups: parseAsStringList,
  taskAutoWs: parseAsBoolean.withDefault(false),
  /** GitHub list. */
  taskGhKind: parseAsStringEnum<TaskGithubKindParam>(["issues", "prs"]).withDefault("issues"),
  taskGhState: parseAsStringEnum<TaskGithubStateParam>(["all", "open", "closed"]).withDefault(
    "open",
  ),
  taskGhRepos: parseAsStringList,
  taskGhAssignees: parseAsStringList,
  taskGhLabels: parseAsStringList,
  taskGhQ: parseAsString.withDefault(""),
  taskGhPage: parseAsInteger.withDefault(1),
  taskGhSort: parseAsStringEnum<TaskGithubSortParam>([
    "created-desc",
    "created-asc",
    "comments-desc",
    "comments-asc",
    "updated-desc",
    "updated-asc",
    "best-match",
  ]).withDefault("updated-desc"),
};
