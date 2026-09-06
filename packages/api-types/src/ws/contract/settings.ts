import type { WsEmpty, WsOk } from "../dto/common";
import type {
  AgentBehaviourSettings,
  AgentBehaviourSettingsUpdateRequest,
  CodeAgentCustomPayload,
  CodeAgentCustomUpdateRequest,
  FunctionSettingsUpdateRequest,
  LlmProviderTestRequest,
  LlmProviderTestResponse,
  LlmProvidersFile,
  LlmProvidersUpdateRequest,
  NotificationSettings,
  NotificationSettingsUpdateRequest,
  NotificationTestPushRequest,
  NotificationTestPushResponse,
  SettingsBootstrapPayload,
  TerminalAgentOptions,
  TerminalAgentModelsGetRequest,
} from "../dto/settings";

export type SettingsContract = {
  settings_bootstrap_get: { input: WsEmpty; output: SettingsBootstrapPayload };
  function_settings_get: { input: WsEmpty; output: unknown };
  function_settings_update: {
    input: FunctionSettingsUpdateRequest;
    output: WsOk;
  };
  terminal_agent_models_get: {
    input: TerminalAgentModelsGetRequest;
    output: TerminalAgentOptions;
  };
  llm_providers_get: { input: WsEmpty; output: LlmProvidersFile };
  llm_providers_update: { input: LlmProvidersUpdateRequest; output: WsOk };
  llm_provider_test: {
    input: LlmProviderTestRequest;
    output: LlmProviderTestResponse;
  };
  code_agent_custom_get: { input: WsEmpty; output: CodeAgentCustomPayload };
  code_agent_custom_update: {
    input: CodeAgentCustomUpdateRequest;
    output: WsOk;
  };
  agent_behaviour_settings_get: { input: WsEmpty; output: AgentBehaviourSettings };
  agent_behaviour_settings_update: {
    input: AgentBehaviourSettingsUpdateRequest;
    output: WsOk;
  };
  notification_settings_get: { input: WsEmpty; output: NotificationSettings };
  notification_settings_update: {
    input: NotificationSettingsUpdateRequest;
    output: WsOk;
  };
  notification_test_push: {
    input: NotificationTestPushRequest;
    output: NotificationTestPushResponse;
  };
};
