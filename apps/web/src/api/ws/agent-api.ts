"use client";

import { wsRequest } from "@/api/ws/request";

export type AgentId = "claude_code" | "codex" | "gemini_cli" | "antigravity_cli";

export interface AgentStatus {
  id: AgentId;
  registry_id: string;
  name: string;
  description: string;
  npm_package: string;
  executable: string;
  installed: boolean;
  executable_path: string | null;
  auth_detected: boolean;
  auth_source: string | null;
}

export interface AgentInstallResponse {
  id: AgentId;
  installed: boolean;
  install_method: string;
  message: string;
}

export interface AgentConfigState {
  id: AgentId;
  has_stored_api_key: boolean;
  auth_detected: boolean;
  auth_source: string | null;
}

export interface RegistryAgent {
  id: string;
  name: string;
  version: string;
  description: string;
  repository: string | null;
  icon: string | null;
  cli_command: string;
  install_method: string;
  package: string | null;
  installed: boolean;
  /** The version currently installed (if installed). May differ from `version` which is the latest. */
  installed_version?: string;
  default_config?: Record<string, string>;
  /** `native` reuses an official CLI with ACP args. `adapter` is a separate ACP package. */
  provision_kind?: "native" | "adapter";
  native_executable?: string | null;
  /** Built-in terminal agent id this ACP agent corresponds to, when known. */
  terminal_agent_id?: string | null;
  /** When false, Atmos bound an existing CLI and must not uninstall it. */
  can_remove?: boolean;
}

export interface CustomAgent {
  name: string;
  type: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  default_config?: Record<string, string>;
}

export interface RegistryInstallResponse {
  registry_id: string;
  installed: boolean;
  install_method: string;
  message: string;
  needs_confirmation?: boolean;
  overwrite_message?: string;
}

export const agentApi = {
  list: async (): Promise<{ agents: AgentStatus[] }> => {
    return wsRequest("agent_list");
  },

  install: async (id: AgentId): Promise<AgentInstallResponse> => {
    return wsRequest("agent_install", { id });
  },

  getConfig: async (id: AgentId): Promise<AgentConfigState> => {
    return wsRequest("agent_config_get", { id });
  },

  setConfig: async (
    id: AgentId,
    apiKey: string,
  ): Promise<{ success: boolean }> => {
    return wsRequest("agent_config_set", {
      id,
      api_key: apiKey,
    });
  },

  listRegistry: async (
    forceRefresh = false,
  ): Promise<{ agents: RegistryAgent[] }> => {
    return wsRequest("agent_registry_list", {
      force_refresh: forceRefresh,
    });
  },

  installRegistry: async (
    registryId: string,
    forceOverwrite = false,
  ): Promise<RegistryInstallResponse> => {
    return wsRequest("agent_registry_install",
      {
        registry_id: registryId,
        force_overwrite: forceOverwrite,
      },
      180_000,
    );
  },

  removeRegistry: async (
    registryId: string,
  ): Promise<RegistryInstallResponse> => {
    return wsRequest("agent_registry_remove",
      {
        registry_id: registryId,
      },
      180_000,
    );
  },

  listCustomAgents: async (): Promise<{ agents: CustomAgent[] }> => {
    return wsRequest("custom_agent_list");
  },

  addCustomAgent: async (agent: {
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  }): Promise<{ success: boolean }> => {
    return wsRequest("custom_agent_add", agent);
  },

  removeCustomAgent: async (name: string): Promise<{ success: boolean }> => {
    return wsRequest("custom_agent_remove", { name });
  },

  getCustomAgentsJson: async (): Promise<{ json: string }> => {
    return wsRequest("custom_agent_get_json");
  },

  setCustomAgentsJson: async (json: string): Promise<{ success: boolean }> => {
    return wsRequest("custom_agent_set_json", { json });
  },

  getManifestPath: async (): Promise<{ path: string }> => {
    return wsRequest("custom_agent_get_manifest_path");
  },
};
