import { reduceLane, type CardId, type LaneState } from "./card-lane";

/** Long enough for the expanded card to paint before the next pill tap. */
export const PARITY_LANE_STEP_MS = 500;

export type ParityLaneShot = {
  atMs: number;
  state: LaneState;
};

/** The lane as loaded, then each tap applied by the same reducer the pill uses. */
export function parityLaneShots(initial: LaneState, taps: readonly CardId[]): ParityLaneShot[] {
  const shots: ParityLaneShot[] = [{ atMs: 0, state: initial }];
  let state = initial;
  taps.forEach((id, index) => {
    state = reduceLane(state, { type: "pill_tapped", id });
    shots.push({ atMs: (index + 1) * PARITY_LANE_STEP_MS, state });
  });
  return shots;
}

/**
 * Swap off the preempted card, swap to a second pill, then tap that pill again
 * so it collapses. Answering a permission is not one of these taps.
 */
export function parityLaneSampleTaps(
  available: readonly CardId[],
  visible: CardId | null,
): CardId[] {
  const others = available.filter((id) => id !== visible);
  const first = others[0];
  const second = others[1] ?? first;
  if (!first || !second) return [];
  return [first, second, second];
}
