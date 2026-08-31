/** Matches ConversationContent `gap-3` (0.75rem) between former stacked messages. */
export const AGENT_CHAT_TRANSCRIPT_GAP = 12;

/** Extra rows each side of the viewport. Chat rows are expensive; keep this modest. */
export const AGENT_CHAT_TRANSCRIPT_OVERSCAN = 8;

/** Keep recently seen mermaid turns mounted so scrolling back does not re-parse them. */
export const AGENT_CHAT_MERMAID_KEEPALIVE = 3;

export const AGENT_CHAT_USER_ROW_ESTIMATE = 88;
export const AGENT_CHAT_ASSISTANT_ROW_ESTIMATE = 240;
export const AGENT_CHAT_ASSISTANT_MERMAID_ROW_ESTIMATE = 480;

/** StickToBottom scroll container class — virtualizer reads this, not the context. */
export const AGENT_CHAT_SCROLL_CLASS = "agent-chat-scroll";

export function estimateAgentChatMessageSize(role: string, hasMermaid = false): number {
  if (role === "user") return AGENT_CHAT_USER_ROW_ESTIMATE;
  if (hasMermaid) return AGENT_CHAT_ASSISTANT_MERMAID_ROW_ESTIMATE;
  return AGENT_CHAT_ASSISTANT_ROW_ESTIMATE;
}

export function estimateTranscriptTotalSize(
  roles: readonly string[],
  gap = AGENT_CHAT_TRANSCRIPT_GAP,
  mermaidFlags?: readonly boolean[],
): number {
  if (roles.length === 0) return 0;
  let size = 0;
  for (let i = 0; i < roles.length; i += 1) {
    if (i > 0) size += gap;
    size += estimateAgentChatMessageSize(roles[i]!, mermaidFlags?.[i] === true);
  }
  return size;
}

export function estimateTranscriptInitialOffset(
  roles: readonly string[],
  viewportHeight: number,
  gap = AGENT_CHAT_TRANSCRIPT_GAP,
  mermaidFlags?: readonly boolean[],
): number {
  return Math.max(
    0,
    estimateTranscriptTotalSize(roles, gap, mermaidFlags) - Math.max(0, viewportHeight),
  );
}

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

const MERMAID_FENCE_RE = /^[ \t]{0,3}```\s*mermaid\b/im;

export function agentMessageHasMermaid(message: {
  parts: ReadonlyArray<{ type: string; text?: string; message?: string }>;
}): boolean {
  for (const part of message.parts) {
    if (part.type === "text" && part.text && MERMAID_FENCE_RE.test(part.text)) return true;
    if (part.type === "thinking" && part.text && MERMAID_FENCE_RE.test(part.text)) return true;
    if (part.type === "error" && part.message && MERMAID_FENCE_RE.test(part.message)) return true;
  }
  return false;
}

export function mergeMermaidKeepAliveRange(
  base: readonly number[],
  mermaidFlags: readonly boolean[],
  previousKept: readonly number[],
  count: number,
  keep = AGENT_CHAT_MERMAID_KEEPALIVE,
): { range: number[]; kept: number[] } {
  const visibleMermaid: number[] = [];
  for (const index of base) {
    if (index >= 0 && index < mermaidFlags.length && mermaidFlags[index]) {
      visibleMermaid.push(index);
    }
  }
  const kept: number[] = [...visibleMermaid];
  for (const index of previousKept) {
    if (index < 0 || index >= count) continue;
    if (kept.includes(index)) continue;
    if (kept.length >= Math.max(keep, visibleMermaid.length)) break;
    kept.push(index);
  }
  const seen = new Set(base);
  const extra = kept.filter((index) => !seen.has(index));
  const range = extra.length === 0 ? [...base] : [...base, ...extra].sort((a, b) => a - b);
  return { range, kept };
}
