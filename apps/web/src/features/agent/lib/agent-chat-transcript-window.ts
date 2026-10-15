export * from "@atmos/agent-transcript/agent-chat-transcript-window";

import { AGENT_CHAT_SCROLL_CLASS } from "@atmos/agent-transcript/agent-chat-transcript-window";

export function findAgentChatScrollElement(root: ParentNode | null): HTMLElement | null {
  if (!root) return null;
  return root.querySelector(`.${AGENT_CHAT_SCROLL_CLASS}`);
}

/** Distance from the scroll content origin to the virtual list origin. */
export function measureTranscriptScrollMargin(
  list: HTMLElement | null,
  scroll: HTMLElement | null,
): number {
  if (!list || !scroll) return 0;
  return list.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
}
