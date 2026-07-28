/**
 * Dual-shift chord detector (Left Shift + Right Shift).
 * Ported from apps/desktop/src-tauri/src/appshot/macos/trigger.rs ShiftChordState,
 * with polling-friendly same-tick dual rising-edge support.
 */

export type ShiftSide = "left" | "right";

export type ShiftChordState = {
  shiftActive: boolean;
  lastSide: ShiftSide | null;
  chordDown: boolean;
};

export function createShiftChordState(): ShiftChordState {
  return {
    shiftActive: false,
    lastSide: null,
    chordDown: false,
  };
}

/**
 * Observe a shift-side sample.
 * @returns true when the second side is pressed while the other side is held
 */
export function observeShiftChord(
  state: ShiftChordState,
  side: ShiftSide,
  shiftActive: boolean,
): boolean {
  if (!shiftActive) {
    resetShiftChord(state);
    return false;
  }

  const shouldTrigger =
    state.shiftActive &&
    state.lastSide != null &&
    state.lastSide !== side &&
    !state.chordDown;

  state.shiftActive = true;
  state.lastSide = side;
  if (shouldTrigger) {
    state.chordDown = true;
  }
  return shouldTrigger;
}

export function resetShiftChord(state: ShiftChordState): void {
  state.shiftActive = false;
  state.lastSide = null;
  state.chordDown = false;
}

/**
 * Edge-driven update from absolute left/right key-down samples (polling).
 * Returns true on the frame where the second shift becomes down.
 *
 * Handles both sequential presses and same-sample dual rising edges
 * (both shifts go down between two 30ms polls).
 */
export function observeShiftChordFromSamples(
  state: ShiftChordState,
  leftDown: boolean,
  rightDown: boolean,
  prevLeft: boolean,
  prevRight: boolean,
): boolean {
  const shiftActive = leftDown || rightDown;
  if (!shiftActive) {
    resetShiftChord(state);
    return false;
  }

  const leftRise = leftDown && !prevLeft;
  const rightRise = rightDown && !prevRight;

  // Same poll window: both rose → first establish one side, then the other triggers.
  if (leftRise && rightRise) {
    observeShiftChord(state, "left", true);
    return observeShiftChord(state, "right", true);
  }
  if (leftRise) {
    return observeShiftChord(state, "left", shiftActive);
  }
  if (rightRise) {
    return observeShiftChord(state, "right", shiftActive);
  }
  return false;
}
