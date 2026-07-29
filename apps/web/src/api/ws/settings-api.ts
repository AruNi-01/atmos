"use client";

import { wsRequest, wsRequestForComputerScope } from "@/api/ws/request";
import { settingsBootstrapCache } from "@/api/ws/settings-bootstrap-cache";
import {
  getComputerQueryScope,
  type ComputerQueryScope,
} from "@/api/query/query-scope";
import type { TerminalAgentSavedRunConfig } from "@/features/agent/lib/terminal-agent-run-config";

export interface FunctionSettings {
  agent_cli?: {
    center_fix_terminal_default_agent?: string;
    /** When true (default), agents launch with YOLO / skip-permissions flags. */
    yolo_mode?: boolean;
    saved_run_configs?: TerminalAgentSavedRunConfig[];
  };
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
    grouping_mode?: "project" | "group" | "status" | "time" | "label" | "priority";
    label_group_order?: string[];
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
    side_context_prompt_budget_bytes?: number;
  };
  workspace_surface?: {
    max_warm_workspaces?: number;
    max_global_terminal_panes?: number;
    max_mounted_editors_per_workspace?: number;
    max_global_mounted_editors?: number;
    max_global_browsers?: number;
    warm_ttl_ms?: number;
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

export type LlmProviderKind =
  | "openai-compatible"
  | "anthropic-compatible"
  | "local-managed"
  | "agent-cli";

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
  /** Only set for kind === "agent-cli" */
  agent_id?: string | null;
}

export interface LlmFeatureBindings {
  git_commit?: string | null;
  git_commit_language?: string | null;
  workspace_issue_todo?: string | null;
  workspace_issue_todo_language?: string | null;
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
    return settingsBootstrapCache.getFunctionSettings();
  },

  update: async (
    functionName: string,
    key: string,
    value: unknown,
    expectedScope?: ComputerQueryScope,
  ): Promise<{ ok: boolean }> => {
    const scope = expectedScope ?? getComputerQueryScope();
    const result = await wsRequestForComputerScope<{ ok: boolean }>(
      scope,
      "function_settings_update",
      {
        function_name: functionName,
        key,
        value,
      },
    );
    if (result.ok) {
      settingsBootstrapCache.patchFunctionSetting(functionName, key, value, scope);
    }
    return result;
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
    return settingsBootstrapCache.getLlmProviders();
  },

  update: async (config: LlmProvidersFile): Promise<{ ok: boolean }> => {
    const result = await wsRequest<{ ok: boolean }>("llm_providers_update", { config });
    if (result.ok) {
      settingsBootstrapCache.setLlmProviders(config);
    }
    return result;
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
  interactiveFlags?: string;
  enabled?: boolean;
}

export interface CodeAgentCustomPayload {
  agents: CodeAgentCustomEntry[];
  [key: string]: unknown;
}

export const codeAgentCustomApi = {
  get: async (): Promise<CodeAgentCustomPayload> => {
    return settingsBootstrapCache.getCodeAgentCustom();
  },

  update: async (agents: CodeAgentCustomEntry[]): Promise<{ ok: boolean }> => {
    const result = await wsRequest<{ ok: boolean }>("code_agent_custom_update", { agents });
    if (result.ok) {
      settingsBootstrapCache.setCodeAgentCustom({ agents });
      settingsBootstrapCache.invalidateAgentBehaviourSettings();
    }
    return result;
  },
};

export interface AgentBehaviourSettings {
  idle_session_timeout_mins: number;
}

export const agentBehaviourSettingsApi = {
  get: async (): Promise<AgentBehaviourSettings> => {
    return settingsBootstrapCache.getAgentBehaviourSettings();
  },
  update: async (settings: AgentBehaviourSettings): Promise<{ ok: boolean }> => {
    const result = await wsRequest<{ ok: boolean }>("agent_behaviour_settings_update", settings);
    if (result.ok) {
      settingsBootstrapCache.setAgentBehaviourSettings(settings);
    }
    return result;
  },
};
