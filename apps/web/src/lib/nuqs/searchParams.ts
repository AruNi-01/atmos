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
  tab: parseAsStringEnum<FixedTab>([
    "overview",
    "terminal",
    "wiki",
    "project-wiki",
    "code-review",
  ]).withDefault("terminal"),
  wikiPage: parseAsString,
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

export const agentManagerParams = {
  agentTab: parseAsStringEnum<AgentTab>(["installed", "registry", "custom"]).withDefault("installed"),
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
};

// ---------------------------------------------------------------------------
// RightSidebar – tab & sub-view
// ---------------------------------------------------------------------------
export type RightSidebarTab = "changes" | "run-preview";
export type ChangesView = "changes" | "pr" | "actions";

export const rightSidebarParams = {
  rsTab: parseAsStringEnum<RightSidebarTab>(["changes", "run-preview"]).withDefault("changes"),
  rsView: parseAsStringEnum<ChangesView>(["changes", "pr", "actions"]).withDefault("changes"),
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
