/** One token per programmatic `updateScene`. Each async `onChange` consumes one token. */
export function createApplyGate() {
  let pending = 0;
  return {
    begin() {
      pending += 1;
    },
    isPending() {
      return pending > 0;
    },
    /** Returns true when this `onChange` is the echo of one programmatic apply. */
    consume() {
      if (pending === 0) return false;
      pending -= 1;
      return true;
    },
    /** Drop unmatched tokens so a late echo cannot swallow the next user stroke. */
    reset() {
      pending = 0;
    },
  };
}

export type ApplyGate = ReturnType<typeof createApplyGate>;
