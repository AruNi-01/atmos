import type { AutomationExecuteMode } from "@/features/automations/types";

export function shouldAutofillTerminalAgent(args: {
  executeMode: AutomationExecuteMode;
  terminalAgentId: string;
  hasSupportedTerminalAgents: boolean;
}): boolean {
  return (
    args.executeMode !== "chat" &&
    args.terminalAgentId.trim().length === 0 &&
    args.hasSupportedTerminalAgents
  );
}

export function shouldAutofillChatAgent(args: {
  executeMode: AutomationExecuteMode;
  chatAgentId: string;
  hasChatAgents: boolean;
}): boolean {
  return (
    args.executeMode === "chat" &&
    args.chatAgentId.trim().length === 0 &&
    args.hasChatAgents
  );
}

export function resolveSetupAgentId(args: {
  executeMode: AutomationExecuteMode;
  terminalAgentId: string;
  chatAgentId: string;
}): string {
  return args.executeMode === "chat" ? args.chatAgentId : args.terminalAgentId;
}

export function isChatAgentSelected(args: {
  chatAgentId: string;
  chatProviderIds: readonly string[];
  catalogReady: boolean;
}): boolean {
  const id = args.chatAgentId.trim();
  if (!id) return false;
  if (!args.catalogReady) return true;
  return args.chatProviderIds.includes(id);
}
