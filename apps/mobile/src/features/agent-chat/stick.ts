import { TRANSCRIPT_END_SLACK_PX } from "@atmos/agent-transcript";
import { copy } from "./copy";

export type StickState = { stickToEnd: boolean };

export const initialStickState: StickState = { stickToEnd: true };

export type StickAction =
  | { type: "scroll"; distance: number; userDragged: boolean }
  | { type: "own_send" }
  | { type: "content_growth" };

/**
 * Distance is pixels from the end of the list. Content growth never resticks;
 * only a real end position, an own send, or a scroll that lands in the slack does.
 */
export function reduceStick(state: StickState, action: StickAction): StickState {
  switch (action.type) {
    case "own_send":
      return state.stickToEnd ? state : { stickToEnd: true };
    case "content_growth":
      return state;
    case "scroll": {
      if (action.distance <= TRANSCRIPT_END_SLACK_PX) {
        return state.stickToEnd ? state : { stickToEnd: true };
      }
      if (action.userDragged) {
        return state.stickToEnd ? { stickToEnd: false } : state;
      }
      return state;
    }
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function scrollBelowUnit(count: number): string {
  return count === 1 ? "message" : "messages";
}

/** Web `scrollBelow` composition: prefix + count + plural unit + suffix. */
export function scrollBelowSentence(count: number): string {
  return [copy.scrollBelowPrefix, String(count), scrollBelowUnit(count), copy.scrollBelowSuffix]
    .filter((part) => part.length > 0)
    .join(" ");
}

export function scrollPillAccessibilityLabel(count: number): string {
  return count > 0 ? scrollBelowSentence(count) : copy.bottom;
}

export function scrollPillVisible(messageCount: number, stickToEnd: boolean): boolean {
  return messageCount > 0 && !stickToEnd;
}

export function composerRowVisible(scrollPill: boolean, cardPillCount: number): boolean {
  return scrollPill || cardPillCount > 0;
}
