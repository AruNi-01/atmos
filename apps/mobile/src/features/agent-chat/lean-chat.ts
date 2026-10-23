export const MOBILE_CHAT_MESSAGE_PAGE_SIZE = 20;
export const MOBILE_CHAT_OLDER_RETRY_LIMIT = 3;

export type ToolDetailStatus = "idle" | "loading" | "ready" | "error";
export type ToolDetailPhase = "body" | "loading" | "retry";

export function leanChatGetRequest(chatId: string) {
  return {
    chat_id: chatId,
    message_limit: MOBILE_CHAT_MESSAGE_PAGE_SIZE,
    include_tool_detail: false as const,
  };
}

export function leanChatSubscribeRequest(chatId: string, afterSequence: number) {
  return {
    chat_id: chatId,
    after_sequence: afterSequence,
    include_tool_detail: false as const,
  };
}

export function olderPageRequest(chatId: string, beforeMessageId: string) {
  return {
    chat_id: chatId,
    limit: MOBILE_CHAT_MESSAGE_PAGE_SIZE,
    before_message_id: beforeMessageId,
    include_tool_detail: false as const,
  };
}

export function olderPageAfterFailure(
  retries: number,
  max = MOBILE_CHAT_OLDER_RETRY_LIMIT,
): { retries: number; showError: boolean; retry: boolean } {
  const next = retries + 1;
  if (next < max) return { retries: next, showError: false, retry: true };
  return { retries: next, showError: true, retry: false };
}

export function toolDetailPhase(input: {
  open: boolean;
  detailOmitted: boolean;
  status: ToolDetailStatus;
}): ToolDetailPhase {
  if (!input.open) return "body";
  if (!input.detailOmitted || input.status === "ready") return "body";
  if (input.status === "error") return "retry";
  return "loading";
}

export function shouldFetchToolDetail(input: {
  open: boolean;
  detailOmitted: boolean;
  status: ToolDetailStatus;
}): boolean {
  return input.open && input.detailOmitted && input.status === "idle";
}

export function shouldRefetchLeanCompleted(input: {
  expanded: boolean;
  detailOmitted: boolean;
  status: string;
}): boolean {
  return (
    input.expanded &&
    input.detailOmitted &&
    (input.status === "completed" || input.status === "failed")
  );
}
