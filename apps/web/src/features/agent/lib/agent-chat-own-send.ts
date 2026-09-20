import {
  COMPOSER_DOCK_EASE_CSS,
  COMPOSER_DOCK_MS,
} from "@/features/agent/lib/agent-chat-composer-dock";

export const OWN_SEND_DRAFT_KEY = "draft";
/** Follow-up lift matches a short ease-out, not the 420ms first-send dock. */
export const OWN_SEND_FOLLOW_MS = 280;
/** If the new bubble already sits on the composer, still lift it out of the input. */
export const OWN_SEND_FOLLOW_MIN_INVERT = 56;
export const OWN_SEND_EASE_CSS = COMPOSER_DOCK_EASE_CSS;

export type OwnSendKind = "first" | "follow";

export function ownSendDurationMs(kind: OwnSendKind): number {
  return kind === "first" ? COMPOSER_DOCK_MS : OWN_SEND_FOLLOW_MS;
}

/** First send always plays; later sends only when the user is following the tail. */
export function shouldAnimateOwnSend(kind: OwnSendKind, following: boolean): boolean {
  return kind === "first" || following;
}

/**
 * Draft → created chat id is the same conversation (pending echo already on screen).
 * Switching chats or returning to a new blank composer should reset.
 */
export function shouldResetOwnSend(prevKey: string, nextKey: string): boolean {
  if (prevKey === nextKey) return false;
  if (prevKey === OWN_SEND_DRAFT_KEY && nextKey !== OWN_SEND_DRAFT_KEY) return false;
  return true;
}

/** Distance to slide a prompt from the composer origin up to its laid-out slot. */
export function ownSendInvertPx(
  promptTop: number,
  originTop: number,
  kind: OwnSendKind = "first",
  minFollow = OWN_SEND_FOLLOW_MIN_INVERT,
): number {
  const measured = Math.max(0, originTop - promptTop);
  if (kind === "follow") return Math.max(measured, minFollow);
  return measured;
}
