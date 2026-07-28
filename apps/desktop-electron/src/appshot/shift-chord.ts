/**
 * Dual-shift chord detector (Left Shift + Right Shift).
 * Ported from apps/desktop/src-tauri/src/appshot/macos/trigger.rs ShiftChordState.
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
 * @param side Physical shift key that changed or is part of the chord
 * @param shiftActive Whether any shift modifier is currently down
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

  // Rising edges only — matches FlagsChanged side detection.
  if (leftDown && !prevLeft) {
    return observeShiftChord(state, "left", shiftActive);
  }
  if (rightDown && !prevRight) {
    return observeShiftChord(state, "right", shiftActive);
  }

  // Held without new side press: keep chord state but do not re-trigger.
  if (!leftDown && !rightDown) {
    resetShiftChord(state);
  }
  return false;
}
