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

/** In-flow spacer under the last message when no above-composer overlays are open. */
export const AGENT_CHAT_TRANSCRIPT_BASE_BOTTOM_PAD_PX = 40;

/** Match StickToBottom's retain duration so overlay collapse eases like overlay open. */
export const AGENT_CHAT_OVERLAY_PAD_SHRINK_MS = 350;
export const AGENT_CHAT_OVERLAY_PAD_SHRINK_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export function transcriptBottomPadStyle(
  heightPx: number,
  shrinking: boolean,
  reduceMotion = false,
): {
  height: number;
  transitionProperty: "height";
  transitionTimingFunction: string;
  transitionDuration: string;
} {
  return {
    height: heightPx,
    transitionProperty: "height",
    transitionTimingFunction: AGENT_CHAT_OVERLAY_PAD_SHRINK_EASING,
    transitionDuration:
      shrinking && !reduceMotion ? `${AGENT_CHAT_OVERLAY_PAD_SHRINK_MS}ms` : "0ms",
  };
}

/** Extra scroll room so the last messages can clear floating above-composer overlays. */
export function transcriptBottomPadPx(overlayHeightPx: number): number {
  return AGENT_CHAT_TRANSCRIPT_BASE_BOTTOM_PAD_PX + Math.max(0, Math.round(overlayHeightPx));
}

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

export function estimateTranscriptOffsetToIndex(
  roles: readonly string[],
  index: number,
  gap = AGENT_CHAT_TRANSCRIPT_GAP,
  mermaidFlags?: readonly boolean[],
): number {
  if (roles.length === 0 || index <= 0) return 0;
  const last = Math.min(index, roles.length - 1);
  let size = 0;
  for (let i = 0; i < last; i += 1) {
    if (i > 0) size += gap;
    size += estimateAgentChatMessageSize(roles[i]!, mermaidFlags?.[i] === true);
  }
  if (last > 0) size += gap;
  return Math.max(0, size);
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

/** Slack for “already at the bottom” while row estimates catch up to measured height. */
export const TRANSCRIPT_END_SLACK_PX = 24;

/**
 * Whether a row size change should shift `scrollTop` to keep the reading line still.
 *
 * Matches TanStack Virtual 3.17.7's default `resizeItem` predicate:
 * - First measure: correct estimate→actual for any row whose top is above the fold.
 * - Later measures (user expand / time row / markdown grow): only shift when the
 *   row is *entirely* above the fold and the user is not scrolling backward.
 *   A visible or below-fold row growing would otherwise shove the current text.
 *
 * Bottom pinning is *not* decided here. `useVirtualizer({ anchorTo: "end" })`
 * keeps the end glued when `getDistanceFromEnd() <= TRANSCRIPT_END_SLACK_PX`.
 */
export function shouldAdjustTranscriptScrollOnItemSizeChange(input: {
  itemStart: number;
  itemSize: number;
  scrollOffset: number;
  firstMeasure: boolean;
  scrollingBackward: boolean;
}): boolean {
  if (input.firstMeasure) {
    return input.itemStart < input.scrollOffset;
  }
  return input.itemStart + input.itemSize <= input.scrollOffset && !input.scrollingBackward;
}

export function isTranscriptScrolledToEnd(
  scroll: { scrollHeight: number; scrollTop: number; clientHeight: number },
  slackPx = TRANSCRIPT_END_SLACK_PX,
): boolean {
  return scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= slackPx;
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

/** Keep find-hit rows mounted so FindPanel can highlight off-screen matches. */
export function mergeIndexKeepAliveRange(
  base: readonly number[],
  keepIndexes: readonly number[],
): number[] {
  if (keepIndexes.length === 0) return [...base];
  const seen = new Set(base);
  const extra = keepIndexes.filter(
    (index) => Number.isInteger(index) && index >= 0 && !seen.has(index),
  );
  return extra.length === 0 ? [...base] : [...base, ...extra].sort((a, b) => a - b);
}
