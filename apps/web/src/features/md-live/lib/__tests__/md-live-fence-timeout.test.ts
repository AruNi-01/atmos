import { describe, expect, test } from "bun:test";
import { shouldFireMdLiveFenceTimeout } from "../md-live-fence-timeout";

describe("shouldFireMdLiveFenceTimeout", () => {
  test("fires only for the active locked run", () => {
    expect(
      shouldFireMdLiveFenceTimeout({ runId: 1, activeRunId: 1, locked: true }),
    ).toBe(true);
  });

  test("does not fire after unlock (Reject / unmount)", () => {
    expect(
      shouldFireMdLiveFenceTimeout({ runId: 1, activeRunId: 1, locked: false }),
    ).toBe(false);
  });

  test("does not fire after a later Run replaced the generation", () => {
    expect(
      shouldFireMdLiveFenceTimeout({ runId: 1, activeRunId: 2, locked: true }),
    ).toBe(false);
  });
});
