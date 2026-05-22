"use client";

import { wsRequest } from "@/api/ws/request";

export type AgentId = "claude_code" | "codex" | "gemini_cli";

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
    return wsRequest<{ agents: AgentStatus[] }>("agent_list");
  },

  install: async (id: AgentId): Promise<AgentInstallResponse> => {
    return wsRequest<AgentInstallResponse>("agent_install", { id });
  },

  getConfig: async (id: AgentId): Promise<AgentConfigState> => {
    return wsRequest<AgentConfigState>("agent_config_get", { id });
  },

  setConfig: async (
    id: AgentId,
    apiKey: string,
  ): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("agent_config_set", {
      id,
      api_key: apiKey,
    });
  },

  listRegistry: async (
    forceRefresh = false,
  ): Promise<{ agents: RegistryAgent[] }> => {
    return wsRequest<{ agents: RegistryAgent[] }>("agent_registry_list", {
      force_refresh: forceRefresh,
    });
  },

  installRegistry: async (
    registryId: string,
    forceOverwrite = false,
  ): Promise<RegistryInstallResponse> => {
    return wsRequest<RegistryInstallResponse>(
      "agent_registry_install",
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
    return wsRequest<RegistryInstallResponse>(
      "agent_registry_remove",
      {
        registry_id: registryId,
      },
      180_000,
    );
  },

  listCustomAgents: async (): Promise<{ agents: CustomAgent[] }> => {
    return wsRequest<{ agents: CustomAgent[] }>("custom_agent_list");
  },

  addCustomAgent: async (agent: {
    name: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  }): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("custom_agent_add", agent);
  },

  removeCustomAgent: async (name: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("custom_agent_remove", { name });
  },

  getCustomAgentsJson: async (): Promise<{ json: string }> => {
    return wsRequest<{ json: string }>("custom_agent_get_json");
  },

  setCustomAgentsJson: async (json: string): Promise<{ success: boolean }> => {
    return wsRequest<{ success: boolean }>("custom_agent_set_json", { json });
  },

  getManifestPath: async (): Promise<{ path: string }> => {
    return wsRequest<{ path: string }>("custom_agent_get_manifest_path");
  },
};
