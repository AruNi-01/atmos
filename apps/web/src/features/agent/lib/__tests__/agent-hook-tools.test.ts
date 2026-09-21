import { describe, expect, it } from "bun:test";
import type { AgentHookInstallReport, AgentHookToolStatus } from "@/api/rest-api";
import {
  AGENT_HOOK_TOOL_KEYS,
  summarizeAgentHookInstall,
} from "../agent-hook-tools";

function status(overrides: Partial<AgentHookToolStatus> = {}): AgentHookToolStatus {
  return { detected: true, installed: false, ...overrides };
}

function report(installed: Iterable<string> = []): AgentHookInstallReport {
  const ready = new Set(installed);
  return Object.fromEntries(
    AGENT_HOOK_TOOL_KEYS.map((key) => [key, status({ installed: ready.has(key) })]),
  ) as AgentHookInstallReport;
}

describe("summarizeAgentHookInstall", () => {
  it("counts every supported tool and lists agents still missing hooks", () => {
    expect(AGENT_HOOK_TOOL_KEYS).toHaveLength(12);
    expect(summarizeAgentHookInstall(null)).toEqual({
      total: 12,
      installedCount: 0,
      missingKeys: [],
      allInstalled: false,
    });

    const partial = summarizeAgentHookInstall(report(["claude_code", "cursor"]));
    expect(partial.installedCount).toBe(2);
    expect(partial.total).toBe(12);
    expect(partial.allInstalled).toBe(false);
    expect(partial.missingKeys).toContain("codex");
    expect(partial.missingKeys).not.toContain("claude_code");

    const complete = summarizeAgentHookInstall(report(AGENT_HOOK_TOOL_KEYS));
    expect(complete).toEqual({
      total: 12,
      installedCount: 12,
      missingKeys: [],
      allInstalled: true,
    });
  });
});
