// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { getTerminalDisplayMeta } from "../terminal-title";
import type { TerminalPaneAgent } from "../../types";

const hermesAgent: TerminalPaneAgent = {
  id: "hermes",
  label: "Hermes Agent",
  command: "hermes",
  iconType: "built-in",
};

describe("terminal title runtime wrapper fallback", () => {
  it("keeps the pane agent title when a Python runtime owns the dynamic title", () => {
    expect(
      getTerminalDisplayMeta({
        baseTitle: "Hermes Agent",
        dynamicTitle: "python3.11",
        agent: hermesAgent,
      }),
    ).toMatchObject({
      displayTitle: "Hermes Agent",
      toolbarAgent: hermesAgent,
    });
  });

  it("falls back to the base title for versioned runtime wrapper commands", () => {
    for (const dynamicTitle of [
      "/opt/homebrew/bin/ruby3.3",
      "Python3.12",
      "go1.22",
      "java-21",
      "NODE20",
    ]) {
      expect(
        getTerminalDisplayMeta({
          baseTitle: "OpenClaw",
          dynamicTitle,
        }).displayTitle,
      ).toBe("OpenClaw");
    }
  });

  it("still shows direct agent commands when the dynamic title names the agent", () => {
    expect(
      getTerminalDisplayMeta({
        baseTitle: "Hermes Agent",
        dynamicTitle: "hermes chat --yolo",
        configuredAgents: [hermesAgent],
      }),
    ).toMatchObject({
      displayTitle: "Hermes Agent",
      toolbarAgent: hermesAgent,
    });
  });
});
