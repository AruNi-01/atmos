import { describe, expect, it } from "bun:test";

import {
  DEFAULT_TERMINAL_SPLIT_PREFS,
  TERMINAL_DEFAULT_SPLIT_AGENT_KEYS,
  parseTerminalSplitPrefsFromSettings,
  resolveDefaultSplitAgent,
  type TerminalSplitPrefs,
} from "../terminal-split-prefs";
import type { TerminalPaneAgent } from "../../types/index";

const claudeAgent: TerminalPaneAgent = {
  id: "claude",
  label: "Claude",
  command: "claude",
  iconType: "built-in",
};

const agents = [
  {
    agent: claudeAgent,
    command: "claude --dangerously-skip-permissions",
  },
];

describe("parseTerminalSplitPrefsFromSettings", () => {
  it("returns defaults for missing terminal settings", () => {
    expect(parseTerminalSplitPrefsFromSettings(undefined)).toEqual(DEFAULT_TERMINAL_SPLIT_PREFS);
    expect(parseTerminalSplitPrefsFromSettings({})).toEqual(DEFAULT_TERMINAL_SPLIT_PREFS);
  });

  it("parses disk keys under function_settings.terminal", () => {
    expect(
      parseTerminalSplitPrefsFromSettings({
        [TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.enabled]: true,
        [TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.agentId]: "claude",
        [TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.runConfig]: {
          model: "claude-opus-4-20250514",
          extra_args: ["--verbose"],
        },
        [TERMINAL_DEFAULT_SPLIT_AGENT_KEYS.applyToNewTerminalTab]: true,
      }),
    ).toEqual({
      enabled: true,
      agentId: "claude",
      runConfig: {
        model: "claude-opus-4-20250514",
        reasoning: null,
        extra_args: ["--verbose"],
      },
      applyToNewTerminalTab: true,
    });
  });
});

describe("resolveDefaultSplitAgent", () => {
  it("returns null when disabled", () => {
    const prefs: TerminalSplitPrefs = {
      ...DEFAULT_TERMINAL_SPLIT_PREFS,
      enabled: false,
      agentId: "claude",
    };
    expect(resolveDefaultSplitAgent(prefs, agents)).toBeNull();
  });

  it("returns null when agentId is missing", () => {
    const prefs: TerminalSplitPrefs = {
      ...DEFAULT_TERMINAL_SPLIT_PREFS,
      enabled: true,
      agentId: null,
    };
    expect(resolveDefaultSplitAgent(prefs, agents)).toBeNull();
  });

  it("returns null when agent is not in the live list", () => {
    const prefs: TerminalSplitPrefs = {
      ...DEFAULT_TERMINAL_SPLIT_PREFS,
      enabled: true,
      agentId: "missing",
    };
    expect(resolveDefaultSplitAgent(prefs, agents)).toBeNull();
  });

  it("returns the agent with base command when no run config", () => {
    const prefs: TerminalSplitPrefs = {
      ...DEFAULT_TERMINAL_SPLIT_PREFS,
      enabled: true,
      agentId: "claude",
    };
    expect(resolveDefaultSplitAgent(prefs, agents)).toEqual({
      agent: claudeAgent,
      command: "claude --dangerously-skip-permissions",
    });
  });

  it("appends run config flags to the launch command", () => {
    const prefs: TerminalSplitPrefs = {
      ...DEFAULT_TERMINAL_SPLIT_PREFS,
      enabled: true,
      agentId: "claude",
      runConfig: {
        model: "claude-opus-4-20250514",
        extra_args: ["--verbose"],
      },
    };
    const resolved = resolveDefaultSplitAgent(prefs, agents);
    expect(resolved?.agent).toEqual(claudeAgent);
    expect(resolved?.command).toContain("claude --dangerously-skip-permissions");
    expect(resolved?.command).toContain("claude-opus-4-20250514");
    expect(resolved?.command).toContain("--verbose");
  });
});
