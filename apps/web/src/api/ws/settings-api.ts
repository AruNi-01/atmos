"use client";

import { wsRequest } from "@/api/ws/request";

export interface FunctionSettings {
  editor?: {
    auto_save?: boolean;
    line_wrap?: boolean;
    bracket_matching?: boolean;
    minimap?: boolean;
    breadcrumbs?: boolean;
    line_highlight?: boolean;
    git_integration?: boolean;
  };
  diff?: {
    diff_style?: "split" | "unified";
    show_backgrounds?: boolean;
    line_numbers?: boolean;
    word_wrap?: boolean;
    diff_indicators?: "bars" | "classic" | "none";
  };
  canvas?: {
    auto_save_interval?: number;
    max_rendered_terminals?: number;
    terminal_context_max_lines?: number;
  };
  workspace_kanban_view?: {
    state?: unknown;
    [key: string]: unknown;
  };
  workspace_sidebar?: {
    grouping_mode?: "project" | "status" | "time";
    [key: string]: unknown;
  };
  inner_browser?: {
    favorite_site?: Array<{
      url: string;
      name?: string;
    }>;
  };
  terminal?: {
    file_link_open_mode?: "atmos" | "finder" | "app";
    file_link_open_app?: string;
  };
  git_commit?: {
    acp_new_session_switch?: boolean;
  };
  workspace_settings?: {
    close_pr_on_delete?: boolean;
    close_issue_on_delete?: boolean;
    delete_remote_branch?: boolean;
    confirm_before_delete?: boolean;
    branch_prefix?: string;
    confirm_before_archive?: boolean;
    kill_tmux_on_archive?: boolean;
    close_acp_on_archive?: boolean;
  };
  experiments?: {
    mgmt_terminals?: boolean;
    mgmt_agents?: boolean;
    center_wiki_tab?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type LlmProviderKind = "openai-compatible" | "anthropic-compatible" | "local-managed";

export interface LlmProviderEntry {
  enabled: boolean;
  displayName?: string | null;
  kind: LlmProviderKind;
  base_url: string;
  api_key: string;
  model: string;
  timeout_ms?: number | null;
  max_output_tokens?: number | null;
  /** Only set for kind === "local-managed" */
  local_model_id?: string | null;
}

export interface SessionTitleFormatConfig {
  include_agent_name?: boolean;
  include_project_name?: boolean;
  include_intent_emoji?: boolean;
}

export interface LlmFeatureBindings {
  session_title?: string | null;
  git_commit?: string | null;
  git_commit_language?: string | null;
  workspace_issue_todo?: string | null;
  workspace_issue_todo_language?: string | null;
  session_title_format?: SessionTitleFormatConfig | null;
}

export interface LlmProvidersFile {
  version: number;
  default_provider?: string | null;
  features: LlmFeatureBindings;
  providers: Record<string, LlmProviderEntry>;
}

export interface LlmProviderTestResponse {
  text: string;
}

export const functionSettingsApi = {
  get: async (): Promise<FunctionSettings> => {
    return wsRequest<FunctionSettings>("function_settings_get");
  },

  update: async (
    functionName: string,
    key: string,
    value: unknown,
  ): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("function_settings_update", {
      function_name: functionName,
      key,
      value,
    });
  },
};

export type GitIgnoreDirStrategy = "symlink" | "copy" | "off";

export interface GitIgnoreDirEntry {
  /** Stable identifier (built-in agent key, or user-generated id for customs). */
  id: string;
  /** Path relative to the project root, e.g. ".claude" or "skills". */
  path: string;
  strategy: GitIgnoreDirStrategy;
  /** True for Atmos-shipped defaults; UI must hide the delete affordance. */
  builtin: boolean;
}

export interface GitIgnoreDirsConfig {
  enabled: boolean;
  entries: GitIgnoreDirEntry[];
}

export const workspaceGitignoreDirsApi = {
  get: async (): Promise<GitIgnoreDirsConfig> => {
    return wsRequest<GitIgnoreDirsConfig>("workspace_gitignore_dirs_get");
  },
  update: async (config: GitIgnoreDirsConfig): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("workspace_gitignore_dirs_update", config);
  },
};

export const llmProvidersApi = {
  get: async (): Promise<LlmProvidersFile> => {
    return wsRequest<LlmProvidersFile>("llm_providers_get");
  },

  update: async (config: LlmProvidersFile): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("llm_providers_update", { config });
  },

  testProvider: async (params: {
    stream_id: string;
    provider_id?: string | null;
    provider: LlmProviderEntry;
  }): Promise<LlmProviderTestResponse> => {
    return wsRequest<LlmProviderTestResponse>("llm_provider_test", params, 120_000);
  },
};

export interface CodeAgentCustomEntry {
  id: string;
  label: string;
  cmd: string;
  flags: string;
  enabled?: boolean;
}

export const codeAgentCustomApi = {
  get: async (): Promise<{ agents: CodeAgentCustomEntry[] }> => {
    return wsRequest<{ agents: CodeAgentCustomEntry[] }>("code_agent_custom_get");
  },

  update: async (agents: CodeAgentCustomEntry[]): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("code_agent_custom_update", { agents });
  },
};

export interface AgentBehaviourSettings {
  idle_session_timeout_mins: number;
}

export const agentBehaviourSettingsApi = {
  get: async (): Promise<AgentBehaviourSettings> => {
    return wsRequest<AgentBehaviourSettings>("agent_behaviour_settings_get");
  },
  update: async (settings: AgentBehaviourSettings): Promise<{ ok: boolean }> => {
    return wsRequest<{ ok: boolean }>("agent_behaviour_settings_update", settings);
  },
};
