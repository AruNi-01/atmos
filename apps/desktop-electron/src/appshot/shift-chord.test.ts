import { describe, expect, it } from "bun:test";
import {
  createShiftChordState,
  observeShiftChord,
  observeShiftChordFromSamples,
  resetShiftChord,
} from "./shift-chord.ts";

describe("ShiftChordState (Tauri parity)", () => {
  it("triggers when the second side is pressed", () => {
    const state = createShiftChordState();
    expect(observeShiftChord(state, "left", true)).toBe(false);
    expect(observeShiftChord(state, "right", true)).toBe(true);
    expect(observeShiftChord(state, "right", true)).toBe(false);
  });

  it("rearms after both shift keys are released", () => {
    const state = createShiftChordState();
    expect(observeShiftChord(state, "right", true)).toBe(false);
    expect(observeShiftChord(state, "left", true)).toBe(true);
    expect(observeShiftChord(state, "left", true)).toBe(false);

    expect(observeShiftChord(state, "right", false)).toBe(false);
    expect(observeShiftChord(state, "right", true)).toBe(false);
    expect(observeShiftChord(state, "left", true)).toBe(true);
  });

  it("reset clears chord", () => {
    const state = createShiftChordState();
    observeShiftChord(state, "left", true);
    observeShiftChord(state, "right", true);
    resetShiftChord(state);
    expect(state).toEqual(createShiftChordState());
  });
});

describe("observeShiftChordFromSamples (polling)", () => {
  it("triggers on second-side rising edge", () => {
    const state = createShiftChordState();
    // left down
    expect(
      observeShiftChordFromSamples(state, true, false, false, false),
    ).toBe(false);
    // right rises while left held
    expect(
      observeShiftChordFromSamples(state, true, true, true, false),
    ).toBe(true);
    // held
    expect(
      observeShiftChordFromSamples(state, true, true, true, true),
    ).toBe(false);
  });

  it("triggers when both shifts rise in the same poll sample", () => {
    const state = createShiftChordState();
    expect(
      observeShiftChordFromSamples(state, true, true, false, false),
    ).toBe(true);
  });

  it("rearms after full release", () => {
    const state = createShiftChordState();
    observeShiftChordFromSamples(state, true, false, false, false);
    observeShiftChordFromSamples(state, true, true, true, false);
    // release both
    expect(
      observeShiftChordFromSamples(state, false, false, true, true),
    ).toBe(false);
    // right then left again
    expect(
      observeShiftChordFromSamples(state, false, true, false, false),
    ).toBe(false);
    expect(
      observeShiftChordFromSamples(state, true, true, false, true),
    ).toBe(true);
  });
});
