export type CardId =
  | "permission"
  | "session_op"
  | "plan"
  | "background"
  | "queue"
  | "subagents"
  | "goal"
  | "workflow"
  | "context";

export type LaneState = {
  visible: CardId | null;
  userChoice: CardId | null;
};

export type LaneAction =
  | { type: "available_changed"; available: readonly CardId[]; arrived: readonly CardId[] }
  | { type: "pill_tapped"; id: CardId }
  | { type: "card_dismissed"; id: CardId };

export const CARD_PILL_ORDER: readonly CardId[] = [
  "permission",
  "session_op",
  "plan",
  "queue",
  "background",
  "subagents",
  "goal",
  "workflow",
  "context",
];

export const INITIAL_LANE: LaneState = { visible: null, userChoice: null };

const PREEMPTING = new Set<CardId>(["permission", "session_op"]);

export function orderedCardIds(available: readonly CardId[]): CardId[] {
  const present = new Set(available);
  return CARD_PILL_ORDER.filter((id) => present.has(id));
}

/** Collapsed permission / session-op pills keep an attention dot. */
export function pillShowsAttention(id: CardId, visible: CardId | null): boolean {
  return PREEMPTING.has(id) && visible !== id;
}

export function reduceLane(state: LaneState, action: LaneAction): LaneState {
  if (action.type === "pill_tapped") {
    if (state.visible === action.id) {
      return {
        visible: null,
        userChoice: state.userChoice === action.id ? null : state.userChoice,
      };
    }
    return { visible: action.id, userChoice: action.id };
  }

  if (action.type === "card_dismissed") {
    if (state.visible !== action.id) return state;
    return {
      visible: null,
      userChoice: state.userChoice === action.id ? null : state.userChoice,
    };
  }

  const available = new Set(action.available);
  let visible = state.visible;
  for (const id of action.arrived) {
    if (PREEMPTING.has(id) && available.has(id)) visible = id;
  }
  if (visible != null && !available.has(visible)) {
    const left = state.visible;
    const choice = state.userChoice;
    visible = choice != null && available.has(choice) && choice !== left ? choice : null;
  }
  if (visible === state.visible) return state;
  return { visible, userChoice: state.userChoice };
}

/**
 * First observation seeds `previous` and does not treat those cards as arrivals.
 * Later diffs are edge-triggered.
 */
export function syncLane(
  state: LaneState,
  previous: readonly CardId[] | null,
  next: readonly CardId[],
): { state: LaneState; previous: readonly CardId[] } {
  if (previous == null) return { state, previous: next };
  if (previous.length === next.length && previous.every((id, index) => id === next[index])) {
    return { state, previous };
  }
  const seen = new Set(previous);
  const arrived = next.filter((id) => !seen.has(id));
  return {
    state: reduceLane(state, { type: "available_changed", available: next, arrived }),
    previous: next,
  };
}
