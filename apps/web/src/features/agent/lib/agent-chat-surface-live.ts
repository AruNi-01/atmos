import type { AgentChatSurfaceVariant } from "@/features/agent/hooks/use-agent-chat-session-types";

export function shouldCommitAgentChatSurface(input: {
  variant: AgentChatSurfaceVariant;
  visuallyActiveWorkspace: boolean;
  panelVisible: boolean;
}): boolean {
  if (input.variant !== "center") return true;
  return input.visuallyActiveWorkspace && input.panelVisible;
}
