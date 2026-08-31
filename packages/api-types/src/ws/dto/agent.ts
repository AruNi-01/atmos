export type AgentId = "claude_code" | "codex" | "gemini_cli" | "antigravity_cli";

export type AgentStatus = {
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
};

export type AgentListResponse = {
  agents: AgentStatus[];
};

export type AgentIdRequest = {
  id: string;
};

export type AgentInstallResponse = {
  id: AgentId;
  installed: boolean;
  install_method: string;
  message: string;
};

export type AgentConfigState = {
  id: AgentId;
  has_stored_api_key: boolean;
  auth_detected: boolean;
  auth_source: string | null;
};

export type AgentConfigSetRequest = {
  id: string;
  api_key: string;
};

export type AgentDefaultConfigSetRequest = {
  registry_id: string;
  config_id: string;
  value: string;
};

export type RegistryAgent = {
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
  installed_version?: string;
  default_config?: Record<string, string>;
  provision_kind?: "native" | "adapter";
  native_executable?: string | null;
  terminal_agent_id?: string | null;
  can_remove?: boolean;
};

export type AgentRegistryListRequest = {
  force_refresh?: boolean;
};

export type AgentRegistryInstallRequest = {
  registry_id: string;
  force_overwrite?: boolean;
};

export type AgentRegistryRemoveRequest = {
  registry_id: string;
};

export type AgentRegistryListResponse = {
  agents: RegistryAgent[];
};

export type RegistryInstallResponse = {
  registry_id: string;
  installed: boolean;
  install_method: string;
  message: string;
  needs_confirmation?: boolean;
  overwrite_message?: string;
};

export type CustomAgent = {
  name: string;
  type: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  default_config?: Record<string, string>;
};

export type CustomAgentAddRequest = {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type CustomAgentListResponse = {
  agents: CustomAgent[];
};

export type CustomAgentNameRequest = {
  name: string;
};

export type CustomAgentJsonResponse = {
  json: string;
};

export type CustomAgentSetJsonRequest = {
  json: string;
};

export type CustomAgentManifestPathResponse = {
  path: string;
};
