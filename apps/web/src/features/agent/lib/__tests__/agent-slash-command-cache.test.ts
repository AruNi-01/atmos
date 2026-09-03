import { describe, expect, it } from "bun:test";
import {
  normalizeAgentSlashCommands,
  resolveAgentSlashCommands,
} from "@/features/agent/store/agent-slash-command-cache";

const session = [{ name: "compact", description: "Compact", hint: null }];
const cached = [{ name: "plan", description: "Plan", hint: null }];

describe("resolveAgentSlashCommands", () => {
  it("prefers live session commands over the agent cache", () => {
    expect(resolveAgentSlashCommands(session, cached)).toEqual(session);
  });

  it("falls back to the per-agent cache before a session exists", () => {
    expect(resolveAgentSlashCommands([], cached)).toEqual(cached);
  });

  it("overlays session injects onto catalog-discovered commands", () => {
    const catalog = [
      { name: "init", description: "Setup", hint: null },
      { name: "review", description: "Review", hint: null },
    ];
    const injected = [{ name: "fork", description: "Fork this session", hint: null }];
    expect(resolveAgentSlashCommands(injected, cached, catalog)).toEqual([
      { name: "init", description: "Setup", hint: null },
      { name: "review", description: "Review", hint: null },
      { name: "fork", description: "Fork this session", hint: null },
    ]);
  });
});

describe("normalizeAgentSlashCommands", () => {
  it("drops unnamed commands and keeps hints", () => {
    expect(
      normalizeAgentSlashCommands([
        { name: "  ", description: "skip" },
        { name: "hooks", description: "List hooks", hint: "path" },
      ]),
    ).toEqual([{ name: "hooks", description: "List hooks", hint: "path" }]);
  });

  it("strips a leading slash so the composer does not render //fork", () => {
    expect(normalizeAgentSlashCommands([{ name: "/fork", description: "Fork this session" }])).toEqual([
      { name: "fork", description: "Fork this session", hint: null },
    ]);
  });
});
