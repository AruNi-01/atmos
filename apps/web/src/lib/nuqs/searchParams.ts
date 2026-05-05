/**
 * Centralized nuqs search param definitions.
 *
 * All URL-persisted state (tabs, dialogs, searches, filters) is declared here
 * so that parsers can be shared between client hooks and (optionally) server
 * loaders.
 */

import {
  parseAsString,
  parseAsStringEnum,
  parseAsBoolean,
  parseAsInteger,
} from "nuqs";

// ---------------------------------------------------------------------------
// CenterStage – tab & wiki page
// ---------------------------------------------------------------------------
export type FixedTab = "overview" | "terminal" | "wiki" | "project-wiki" | "code-review";

export const centerStageParams = {
  tab: parseAsString.withDefault("terminal"),
  wikiPage: parseAsString,
  newWorkspace: parseAsBoolean.withDefault(false),
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
// SkillsView – scope filter & search
// ---------------------------------------------------------------------------
export type SkillsTab = "installed" | "market" | "resources";
export type ScopeFilter = "all" | "global" | "project";

export const skillsParams = {
  tab: parseAsStringEnum<SkillsTab>(["installed", "market", "resources"]).withDefault("installed"),
  filter: parseAsStringEnum<ScopeFilter>(["all", "global", "project"]).withDefault("all"),
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

export const tokenUsageParams = {
  tokenUsage: parseAsBoolean.withDefault(false),
};

export type SettingsModalTab = "about" | "terminal" | "code-agent" | "workspace" | "labels" | "ai" | "notify" | "remote-access";

export const settingsModalParams = {
  settingsModal: parseAsBoolean.withDefault(false),
  activeSettingTab: parseAsStringEnum<SettingsModalTab>(["about", "terminal", "code-agent", "workspace", "labels", "ai", "notify", "remote-access"]).withDefault("about"),
};

// ---------------------------------------------------------------------------
// OverviewTab – PR detail modal
// ---------------------------------------------------------------------------
export const overviewParams = {
  pr: parseAsInteger,
};

// ---------------------------------------------------------------------------
// Agent Chat Panel (global)
// ---------------------------------------------------------------------------
export const agentChatParams = {
  chat: parseAsBoolean.withDefault(false),
};

// ---------------------------------------------------------------------------
// RightSidebar – PR & Actions modals
// ---------------------------------------------------------------------------
export const rightSidebarModalParams = {
  rsPr: parseAsInteger,
  rsRunId: parseAsInteger,
  rsCreatePr: parseAsBoolean.withDefault(false),
};

// ---------------------------------------------------------------------------
// LeftSidebar – tab
// ---------------------------------------------------------------------------
export type LeftSidebarTab = "projects" | "files";

export const leftSidebarParams = {
  lsTab: parseAsStringEnum<LeftSidebarTab>(["projects", "files"]).withDefault("projects"),
  lsKanban: parseAsBoolean.withDefault(false),
  lsKanbanQ: parseAsString.withDefault(""),
};

// ---------------------------------------------------------------------------
// RightSidebar – tab & sub-view
// ---------------------------------------------------------------------------
export type RightSidebarTab = "changes" | "run-preview";
export type ChangesView = "changes" | "pr" | "actions" | "review";

export const rightSidebarParams = {
  rsTab: parseAsStringEnum<RightSidebarTab>(["changes", "run-preview"]).withDefault("changes"),
  rsView: parseAsStringEnum<ChangesView>(["changes", "pr", "actions", "review"]).withDefault("changes"),
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
  status: parseAsStringEnum<"active" | "closed" | "">(["active", "closed", ""]).withDefault(""),
  mode: parseAsStringEnum<"default" | "wiki_ask" | "">(["default", "wiki_ask", ""]).withDefault(""),
};
