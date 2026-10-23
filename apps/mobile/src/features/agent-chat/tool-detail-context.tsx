import { createContext, useContext } from "react";
import type { ToolDetailStatus } from "./lean-chat";

export type AgentChatToolDetailApi = {
  statusFor: (toolCallId: string) => ToolDetailStatus;
  load: (toolCallId: string) => void;
};

const AgentChatToolDetailContext = createContext<AgentChatToolDetailApi>({
  statusFor: () => "idle",
  load: () => {},
});

export const AgentChatToolDetailProvider = AgentChatToolDetailContext.Provider;

export function useAgentChatToolDetail(): AgentChatToolDetailApi {
  return useContext(AgentChatToolDetailContext);
}
