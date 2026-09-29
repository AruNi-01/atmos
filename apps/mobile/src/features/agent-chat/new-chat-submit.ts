import type { AgentChatCreateRequest } from "@atmos/api-types/ws/dto/agent-chat";
import type { ChatScope } from "./scope";

export type MobileChatDraft = {
  scope: ChatScope;
  cwd: string | null;
  provider_id: string;
  model: string | null;
  thinking: string | null;
  mode: string | null;
  permission_mode: string | null;
  fast: string | null;
  context: string | null;
  text: string;
  hasAttachments?: boolean;
};

export type NewChatPlan =
  | { create: AgentChatCreateRequest; sendText: string }
  | { error: string };

function optionalField(value: string | null): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

export function submitStep(
  createdChatId: string | null,
  submitting: boolean,
): "ignore" | "create" | "send" {
  if (submitting) return "ignore";
  if (createdChatId == null) return "create";
  return "send";
}

export function planNewChatSubmit(draft: MobileChatDraft): NewChatPlan {
  const sendText = draft.text.trim();
  if (sendText.length === 0 && !draft.hasAttachments) {
    return { error: "Write a message to start this chat." };
  }
  const create: AgentChatCreateRequest = {
    ...draft.scope,
    cwd: draft.cwd,
    provider_id: draft.provider_id,
  };
  const model = optionalField(draft.model);
  const thinking = optionalField(draft.thinking);
  const mode = optionalField(draft.mode);
  const permissionMode = optionalField(draft.permission_mode);
  const fast = optionalField(draft.fast);
  const context = optionalField(draft.context);
  if (model) create.model = model;
  if (thinking) create.thinking = thinking;
  if (mode) create.mode = mode;
  if (permissionMode) create.permission_mode = permissionMode;
  if (fast) create.fast = fast;
  if (context) create.context = context;
  return { create, sendText };
}
