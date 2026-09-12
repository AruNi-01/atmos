import { describe, expect, test } from "bun:test";
import { automationMdLivePath } from "../automation-md-live-path";

describe("automationMdLivePath", () => {
  test("uses untitled paths for instructions", () => {
    expect(automationMdLivePath("instructions")).toBe(
      "untitled:automation-instructions.md",
    );
    expect(automationMdLivePath("instructions", { guid: "abc" })).toBe(
      "untitled:automation-abc-instructions.md",
    );
  });

  test("prefers the on-disk memory path", () => {
    expect(
      automationMdLivePath("memory", {
        guid: "abc",
        diskPath: "/home/.atmos/automations/definitions/abc/memory.md",
      }),
    ).toBe("/home/.atmos/automations/definitions/abc/memory.md");
    expect(automationMdLivePath("memory")).toBe("untitled:automation-memory.md");
  });
});
