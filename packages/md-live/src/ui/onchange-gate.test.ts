import { describe, expect, test } from "bun:test";
import { createMdLiveOnChangeGate } from "./onchange-gate";

describe("createMdLiveOnChangeGate", () => {
  test("no-edit serialize equal to the load value does not commit", () => {
    const gate = createMdLiveOnChangeGate("# Hi\n");
    expect(gate("# Hi\n")).toBeNull();
    gate.arm();
    expect(gate("# Hi\n")).toBeNull();
  });

  test("format-only serialize before arm does not commit", () => {
    const gate = createMdLiveOnChangeGate("| a | b |\n| --- | --- |\n");
    expect(gate("| a | b |\n| --- | --- |\n|  |  |\n")).toBeNull();
    gate.arm();
    expect(gate("| a | b |\n| --- | --- |\n|  |  |\n")).toBeNull();
  });

  test("the first real edit after arm commits", () => {
    const gate = createMdLiveOnChangeGate("# Hi\n");
    expect(gate("# Hi\n")).toBeNull();
    gate.arm();
    expect(gate("# Hello\n")).toBe("# Hello\n");
  });

  test("duplicate serialize after an edit does not re-commit", () => {
    const gate = createMdLiveOnChangeGate("# Hi\n");
    gate.arm();
    expect(gate("# Hello\n")).toBe("# Hello\n");
    expect(gate("# Hello\n")).toBeNull();
  });

  test("returning to the format baseline restores the loaded source", () => {
    const loaded = "| a | b |\n| --- | --- |\n";
    const formatted = "| a | b |\n| --- | --- |\n|  |  |\n";
    const gate = createMdLiveOnChangeGate(loaded);
    expect(gate(formatted)).toBeNull();
    gate.arm();
    expect(gate("| a | edited |\n| --- | --- |\n")).toBe("| a | edited |\n| --- | --- |\n");
    expect(gate(formatted)).toBe(loaded);
  });
});
