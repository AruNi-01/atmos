import { describe, expect, test } from "bun:test";
import { createMdLiveOnChangeGate } from "./onchange-gate";

describe("createMdLiveOnChangeGate", () => {
  test("no-edit serialize equal to the load value does not commit", () => {
    const gate = createMdLiveOnChangeGate("# Hi\n");
    expect(gate("# Hi\n")).toBeNull();
  });

  test("the first real edit commits", () => {
    const gate = createMdLiveOnChangeGate("# Hi\n");
    expect(gate("# Hello\n")).toBe("# Hello\n");
  });

  test("duplicate serialize after an edit does not re-commit", () => {
    const gate = createMdLiveOnChangeGate("# Hi\n");
    expect(gate("# Hello\n")).toBe("# Hello\n");
    expect(gate("# Hello\n")).toBeNull();
  });
});
