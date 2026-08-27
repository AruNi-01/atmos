import { describe, expect, test } from "bun:test";
import { createMdLiveOnChangeGate } from "../md-live-onchange-gate";

describe("createMdLiveOnChangeGate", () => {
  test("no-edit serialize equal to the load value does not commit", () => {
    const gate = createMdLiveOnChangeGate("# Hi\n");
    expect(gate("# Hi\n")).toBeNull();
  });

  test("the first real edit commits (skip-first would drop this)", () => {
    const gate = createMdLiveOnChangeGate("# Hi\n");
    expect(gate("# Hello\n")).toBe("# Hello\n");
  });

  test("duplicate serialize after an edit does not re-commit", () => {
    const gate = createMdLiveOnChangeGate("# Hi\n");
    expect(gate("# Hello\n")).toBe("# Hello\n");
    expect(gate("# Hello\n")).toBeNull();
  });

  test("undo back to the load value commits so dirty can clear", () => {
    const gate = createMdLiveOnChangeGate("# Hi\n");
    expect(gate("# Hello\n")).toBe("# Hello\n");
    expect(gate("# Hi\n")).toBe("# Hi\n");
  });
});
