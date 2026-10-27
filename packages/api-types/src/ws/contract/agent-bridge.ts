import type {
  AgentBridgeDeliveryAck,
  AgentBridgeReplyRequest,
  AgentBridgeSendRequest,
  AgentBridgeStatusRequest,
  AgentBridgeStatusResponse,
} from "../dto/agent-bridge";

export type AgentBridgeContract = {
  agent_bridge_send: {
    input: AgentBridgeSendRequest;
    output: AgentBridgeDeliveryAck[];
  };
  agent_bridge_request: {
    input: AgentBridgeSendRequest;
    output: AgentBridgeDeliveryAck[];
  };
  agent_bridge_reply: {
    input: AgentBridgeReplyRequest;
    output: AgentBridgeDeliveryAck[];
  };
  agent_bridge_status: {
    input: AgentBridgeStatusRequest;
    output: AgentBridgeStatusResponse;
  };
};
