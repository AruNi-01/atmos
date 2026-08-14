/**
 * Centralized nuqs search param definitions.
 *
 * All URL-persisted state (tabs, dialogs, searches, filters) is declared here
 * so that parsers can be shared between client hooks and (optionally) server
 * loaders.
 */

import {
  createParser,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
} from "nuqs";

// ---------------------------------------------------------------------------
// CenterStage – tab & wiki page
// ---------------------------------------------------------------------------
export type FixedTab = "overview" | "terminal" | "wiki" | "project-wiki" | "code-review";

export const centerStageParams = {
  tab: parseAsString.withDefault("terminal"),
  wikiPage: parseAsString,
  newWorkspace: parseAsBoolean.withDefault(false),
  canvas: parseAsBoolean.withDefault(false),
  /** Deep-link: focus terminal pane by tmux window name (paired with `tab` = terminal sub-tab id). */
  terminalTmux: parseAsString,
  /** Deep-link: open/focus a terminal side chat on the source pane. */
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
export type AutomationTargetFilter = "all" | "project" | "workspace" | "standalone";

export const automationsParams = {
  view: parseAsStringEnum<AutomationsView>(["list", "create", "edit", "history"])
    .withDefault("list")
    .withOptions({ history: "push" }),
  automation: parseAsString.withDefault(""),
  run: parseAsString.withDefault(""),
  target: parseAsStringEnum<AutomationTargetFilter>(["all", "project", "workspace", "standalone"]).withDefault("all"),
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
export type AgentTab = "installed" | "registry" | "custom";
export type AgentManagerView = "manager" | "sessions";

export const agentManagerParams = {
  agentView: parseAsStringEnum<AgentManagerView>(["manager", "sessions"]).withDefault("manager"),
  agentTab: parseAsStringEnum<AgentTab>(["installed", "registry", "custom"]).withDefault("registry"),
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
  | "about"
  | "layout"
  | "editor"
  | "canvas"
  | "terminal"
  | "code-agent"
  | "workspace"
  | "labels"
  | "account"
  | "integrations"
  | "ai"
  | "notify"
  | "tunnel-connector"
  | "atmos-computer"
  | "desktop-use"
  | "browser"
  | "permission-access"
  | "shortcuts"
  | "experiments";

export const settingsModalParams = {
  settingsModal: parseAsBoolean.withDefault(false),
  activeSettingTab: parseAsStringEnum<SettingsModalTab>([
    "about",
    "layout",
    "editor",
    "canvas",
    "terminal",
    "code-agent",
    "workspace",
    "labels",
    "account",
    "integrations",
    "ai",
    "notify",
    "tunnel-connector",
    "atmos-computer",
    "desktop-use",
    "browser",
    "permission-access",
    "shortcuts",
    "experiments",
  ]).withDefault("layout"),
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
// RightSidebar – create pull request dialog
// ---------------------------------------------------------------------------
export const rightSidebarDialogParams = {
  rsCreatePr: parseAsBoolean.withDefault(false),
};

// ---------------------------------------------------------------------------
// LeftSidebar – tab
// ---------------------------------------------------------------------------
export type LeftSidebarTab = "projects" | "files";

export const leftSidebarParams = {
  lsTab: parseAsStringEnum<LeftSidebarTab>(["projects", "files"]).withDefault("projects"),
  lsTask: parseAsBoolean.withDefault(false),
  lsTaskQ: parseAsString.withDefault(""),
};

// ---------------------------------------------------------------------------
// RightSidebar – tab
// ---------------------------------------------------------------------------
export type RightSidebarTab =
  | "files"
  | "changes"
  | "github"
  | "review"
  | "browser"
  | "simulator"
  | "run";

const RIGHT_SIDEBAR_TABS = [
  "files",
  "changes",
  "github",
  "review",
  "browser",
  "simulator",
  "run",
] as const satisfies readonly RightSidebarTab[];

/** Legacy deep-link values from before PR/Issues/Actions were merged into GitHub. */
const LEGACY_RS_TAB_MAP: Record<string, RightSidebarTab> = {
  pr: "github",
  issues: "github",
  actions: "github",
};

function parseRightSidebarTab(value: string): RightSidebarTab | null {
  const mapped = LEGACY_RS_TAB_MAP[value] ?? value;
  return (RIGHT_SIDEBAR_TABS as readonly string[]).includes(mapped)
    ? (mapped as RightSidebarTab)
    : null;
}

export const rightSidebarParams = {
  rsTab: createParser({
    parse: parseRightSidebarTab,
    serialize: (value: RightSidebarTab) => value,
  }).withDefault("changes" satisfies RightSidebarTab),
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
