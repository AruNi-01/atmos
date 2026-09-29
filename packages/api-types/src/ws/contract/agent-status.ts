import type { WsOk } from "../dto/common";
import type {
  AgentSessionArchiveRequest,
  AgentSessionStatusListRequest,
  AgentSessionStatusListResponse,
} from "../dto/agent-status";

export type AgentStatusContract = {
  agent_session_status_list: {
    input: AgentSessionStatusListRequest;
    output: AgentSessionStatusListResponse;
  };
  agent_session_archive: {
    input: AgentSessionArchiveRequest;
    output: WsOk;
  };
};
