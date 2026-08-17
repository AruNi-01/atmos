/** Tracks programmatic `updateScene` / load so the next Excalidraw `onChange` is ignored. */
export function createApplyGate() {
  let gen = 0;
  let seen = 0;
  return {
    begin() {
      gen += 1;
    },
    isPending() {
      return seen !== gen;
    },
    /** Returns true when this `onChange` is the echo of a programmatic apply. */
    consume() {
      if (seen === gen) return false;
      seen = gen;
      return true;
    },
  };
}

export type ApplyGate = ReturnType<typeof createApplyGate>;
