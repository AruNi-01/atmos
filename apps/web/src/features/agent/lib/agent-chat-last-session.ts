import type { AgentLastSession } from "@/shared/stores/use-ui-pref-hooks";
import {
  getSessionContextKey,
  legacySessionContextKey,
} from "@/features/agent/lib/chat-helpers";
import {
  readAgentLastSession,
  writeAgentLastSession,
} from "@/shared/stores/use-ui-pref-hooks";

export function agentChatFilterKey(
  workspaceId: string | null,
  projectId: string | null,
  mode: string,
): string {
  return getSessionContextKey(workspaceId, projectId, mode);
}

export function agentChatInstanceKey(
  workspaceId: string | null,
  projectId: string | null,
  mode: string,
  instanceKey?: string | null,
): string | null {
  const instance = instanceKey?.trim();
  if (!instance) return null;
  return `${getSessionContextKey(workspaceId, projectId, mode)}:instance:${instance}`;
}

export function resolveRestoredAgentChat(input: {
  chatIdProp: string;
  instanceKey?: string | null;
  instanceLast: AgentLastSession | null;
  filterLast: AgentLastSession | null;
  installedAgentIds: string[];
  defaultRegistryId: string;
}): { chatId: string; registryId: string } {
  const pickRegistry = (id: string | null | undefined) => {
    const next = id?.trim() ?? "";
    if (!next) return "";
    if (input.installedAgentIds.length === 0) return next;
    return input.installedAgentIds.includes(next) ? next : "";
  };

  const registryId =
    pickRegistry(input.instanceLast?.registryId) ||
    pickRegistry(input.filterLast?.registryId) ||
    pickRegistry(input.defaultRegistryId);

  const fromProp = input.chatIdProp.trim();
  if (fromProp) {
    return { chatId: fromProp, registryId };
  }

  const instanceChatId = input.instanceLast?.chatId?.trim() ?? "";
  if (instanceChatId) {
    return { chatId: instanceChatId, registryId };
  }

  if (input.instanceKey?.trim()) {
    return { chatId: "", registryId };
  }

  return {
    chatId: input.filterLast?.chatId?.trim() ?? "",
    registryId,
  };
}

export function readAgentChatLastSessions(input: {
  workspaceId: string | null;
  projectId: string | null;
  mode: string;
  instanceKey?: string | null;
}): { filterLast: AgentLastSession | null; instanceLast: AgentLastSession | null } {
  const filterKey = agentChatFilterKey(input.workspaceId, input.projectId, input.mode);
  const legacyKey = legacySessionContextKey(input.workspaceId, input.projectId);
  const instanceKey = agentChatInstanceKey(
    input.workspaceId,
    input.projectId,
    input.mode,
    input.instanceKey,
  );
  return {
    filterLast: readAgentLastSession(filterKey) ?? readAgentLastSession(legacyKey),
    instanceLast: instanceKey ? readAgentLastSession(instanceKey) : null,
  };
}

export function persistAgentChatLastSession(input: {
  workspaceId: string | null;
  projectId: string | null;
  mode: string;
  instanceKey?: string | null;
  registryId: string;
  chatId?: string | null;
  cwd?: string | null;
}): void {
  const registryId = input.registryId.trim();
  if (!registryId) return;
  const chatId = input.chatId?.trim() || null;
  const now = Date.now();
  const filterKey = agentChatFilterKey(input.workspaceId, input.projectId, input.mode);
  const previousFilter = readAgentLastSession(filterKey);
  writeAgentLastSession(filterKey, {
    registryId,
    chatId: chatId ?? previousFilter?.chatId ?? null,
    cwd: input.cwd ?? previousFilter?.cwd ?? null,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    updatedAt: now,
  });

  const instanceKey = agentChatInstanceKey(
    input.workspaceId,
    input.projectId,
    input.mode,
    input.instanceKey,
  );
  if (!instanceKey) return;
  const previousInstance = readAgentLastSession(instanceKey);
  writeAgentLastSession(instanceKey, {
    registryId,
    chatId,
    cwd: input.cwd ?? previousInstance?.cwd ?? null,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    updatedAt: now,
  });
}
