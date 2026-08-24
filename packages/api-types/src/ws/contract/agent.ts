import type { WsEmpty, WsSuccess } from "../dto/common";
import type {
  AgentConfigSetRequest,
  AgentConfigState,
  AgentIdRequest,
  AgentInstallResponse,
  AgentListResponse,
  AgentRegistryListRequest,
  AgentRegistryListResponse,
  AgentRegistryInstallRequest,
  AgentRegistryRemoveRequest,
  CustomAgentAddRequest,
  CustomAgentJsonResponse,
  CustomAgentListResponse,
  CustomAgentManifestPathResponse,
  CustomAgentNameRequest,
  CustomAgentSetJsonRequest,
  RegistryInstallResponse,
} from "../dto/agent";

export type AgentContract = {
  agent_list: { input: WsEmpty; output: AgentListResponse };
  agent_install: { input: AgentIdRequest; output: AgentInstallResponse };
  agent_config_get: { input: AgentIdRequest; output: AgentConfigState };
  agent_config_set: { input: AgentConfigSetRequest; output: WsSuccess };
  agent_registry_list: {
    input: AgentRegistryListRequest;
    output: AgentRegistryListResponse;
  };
  agent_registry_install: {
    input: AgentRegistryInstallRequest;
    output: RegistryInstallResponse;
  };
  agent_registry_remove: {
    input: AgentRegistryRemoveRequest;
    output: RegistryInstallResponse;
  };
  custom_agent_list: { input: WsEmpty; output: CustomAgentListResponse };
  custom_agent_add: { input: CustomAgentAddRequest; output: WsSuccess };
  custom_agent_remove: { input: CustomAgentNameRequest; output: WsSuccess };
  custom_agent_get_json: { input: WsEmpty; output: CustomAgentJsonResponse };
  custom_agent_set_json: { input: CustomAgentSetJsonRequest; output: WsSuccess };
  custom_agent_get_manifest_path: {
    input: WsEmpty;
    output: CustomAgentManifestPathResponse;
  };
};
