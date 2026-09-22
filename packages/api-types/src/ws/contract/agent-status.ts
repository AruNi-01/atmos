import type { WsEmpty, WsOk } from "../dto/common";
import type {
  AgentSessionArchiveRequest,
  AgentSessionStatusListResponse,
} from "../dto/agent-status";

export type AgentStatusContract = {
  agent_session_status_list: {
    input: WsEmpty;
    output: AgentSessionStatusListResponse;
  };
  agent_session_archive: {
    input: AgentSessionArchiveRequest;
    output: WsOk;
  };
};
