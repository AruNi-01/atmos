// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { resolveMobileTerminalHeading } from "./terminal-heading";

describe("mobile terminal heading", () => {
  test("uses the stable broadcast session topic and the agent icon", () => {
    const heading = resolveMobileTerminalHeading({
      baseTitle: "zsh",
      dynamicTitle: "grok",
      oscTitle: "Greeting and asking who Grok is - grok",
    });

    expect(heading.title).toBe("Greeting and asking who Grok is");
    expect(heading.agentId).toBe("grok-build");
    expect(heading.sessionOscTitle).toBe("Greeting and asking who Grok is");
  });

  test("keeps the session topic when a later broadcast is only activity", () => {
    const heading = resolveMobileTerminalHeading({
      baseTitle: "zsh",
      dynamicTitle: "grok",
      oscTitle: "Responding - grok",
      sessionOscTitle: "Greeting and asking who Grok is",
    });

    expect(heading.title).toBe("Greeting and asking who Grok is");
    expect(heading.agentId).toBe("grok-build");
  });
});
