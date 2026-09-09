import { AGENT_CHAT_TRANSCRIPT_GAP } from "@/features/agent/lib/agent-chat-transcript-window";

export type ComposerFlyKind = "conversation" | "queue";

export type ComposerFlyingMessage = {
  id: number;
  text: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

/** Chip center sits just into the top of the incoming user bubble. */
const INCOMING_BUBBLE_TOP_INSET = 16;

function centerOf(rect: DOMRectReadOnly): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function isLaidOut(rect: DOMRectReadOnly): boolean {
  return rect.width > 0 || rect.height > 0;
}

function rectOf(el: HTMLElement | null | undefined): DOMRect | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return isLaidOut(rect) ? rect : null;
}

function query(scope: ParentNode, selector: string): HTMLElement | null {
  return scope.querySelector<HTMLElement>(selector);
}

function lastLaidOut(scope: ParentNode, selector: string): HTMLElement | null {
  const nodes = scope.querySelectorAll<HTMLElement>(selector);
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const el = nodes[i];
    if (el && rectOf(el)) return el;
  }
  return null;
}

/** Last painted transcript row, including assistant file-changes and activity. */
function lastTranscriptAnchor(scope: ParentNode): DOMRect | null {
  const row = lastLaidOut(scope, "[data-agent-chat-transcript] [data-index]");
  const rowRect = rectOf(row);
  if (rowRect) return rowRect;
  return rectOf(lastLaidOut(scope, "[data-agent-chat-message]"));
}

function incomingUserPoint(anchor: DOMRect): { x: number; y: number } {
  return {
    x: anchor.right - 36,
    y: Math.max(24, anchor.bottom + AGENT_CHAT_TRANSCRIPT_GAP + INCOMING_BUBBLE_TOP_INSET),
  };
}

/** Origin is this send's composer — never another kept-alive Agent Chat tab. */
export function composerShellOrigin(
  composer: HTMLElement | null | undefined,
): { x: number; y: number } | null {
  const shell = composer?.querySelector<HTMLElement>("form") ?? composer ?? null;
  const rect = rectOf(shell);
  return rect ? centerOf(rect) : null;
}

/**
 * Destination stays inside this chat column.
 * Conversation flies to the top of the slot after the last painted row
 * (assistant text + file changes), not a fixed offset or a previous user bubble.
 */
export function composerFlyTarget(
  kind: ComposerFlyKind,
  composer: HTMLElement | null | undefined,
): { x: number; y: number } | null {
  if (!composer) return null;
  const column = composer.closest<HTMLElement>("[data-agent-chat-column]");
  const scope: ParentNode = column ?? composer;

  if (kind === "queue") {
    const dock = rectOf(query(composer, "[data-agent-message-queue]"));
    if (dock) {
      return { x: dock.left + Math.min(88, dock.width / 2), y: dock.top + 18 };
    }
    const cards = rectOf(query(composer, "[data-agent-composer-upper-cards]"));
    const shell = rectOf(composer);
    const rect = cards ?? shell;
    if (!rect) return null;
    return { x: rect.left + Math.min(88, rect.width / 2), y: rect.top + 18 };
  }

  const landing = composer.getAttribute("data-agent-composer-landing") === "true";
  const columnRect = rectOf(column);
  const anchor = lastTranscriptAnchor(scope);
  if (anchor && !landing) {
    return incomingUserPoint(anchor);
  }

  const shell = rectOf(composer);
  const right = columnRect?.right ?? shell?.right;
  if (right == null) return null;
  const top = columnRect?.top ?? 24;
  return { x: right - 72, y: Math.max(24, top + 48) };
}

export function buildComposerFlyingMessage({
  id,
  text,
  from,
  to,
}: {
  id: number;
  text: string;
  from: { x: number; y: number } | null;
  to: { x: number; y: number } | null;
}): ComposerFlyingMessage | null {
  if (!from || !to) return null;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return {
    id,
    text: trimmed.length > 90 ? `${trimmed.slice(0, 87)}...` : trimmed,
    from,
    to,
  };
}
