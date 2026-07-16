// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { getTerminalDisplayMeta, resolveAgentForTitle } from "@atmos/shared/terminal";
import type { TerminalPaneAgent } from "../../types";

const hermesAgent: TerminalPaneAgent = {
  id: "hermes",
  label: "Hermes Agent",
  command: "hermes",
  iconType: "built-in",
};

const grokAgent: TerminalPaneAgent = {
  id: "grok-build",
  label: "Grok Build",
  command: "grok",
  iconType: "built-in",
};

const cursorAgent: TerminalPaneAgent = {
  id: "cursor",
  label: "Cursor Agent",
  command: "cursor-agent",
  iconType: "built-in",
};

const agents = [grokAgent, cursorAgent, hermesAgent];

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

  it("restores the toolbar agent from a persisted label when the runtime title is node", () => {
    expect(
      getTerminalDisplayMeta({
        baseTitle: "Hermes Agent",
        dynamicTitle: "node",
        configuredAgents: [hermesAgent],
      }),
    ).toMatchObject({
      displayTitle: "Hermes Agent",
      toolbarAgent: hermesAgent,
    });
  });

  it("restores the toolbar agent from a unique agent label suffix", () => {
    expect(
      getTerminalDisplayMeta({
        baseTitle: "Hermes Agent-2",
        dynamicTitle: "NODE20",
        configuredAgents: [hermesAgent],
      }),
    ).toMatchObject({
      displayTitle: "Hermes Agent",
      toolbarAgent: hermesAgent,
    });
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

describe("terminal title APP-036 unique + contested agent matching", () => {
  it("S7 — maps unique commands to Grok Build and Cursor Agent", () => {
    expect(
      getTerminalDisplayMeta({
        baseTitle: "shell",
        dynamicTitle: "grok --always-approve",
        configuredAgents: agents,
      }).toolbarAgent?.id,
    ).toBe("grok-build");

    expect(
      getTerminalDisplayMeta({
        baseTitle: "shell",
        dynamicTitle: "cursor-agent --yolo",
        configuredAgents: agents,
      }).toolbarAgent?.id,
    ).toBe("cursor");
  });

  it("S8 — does not match cursor-agent via substring of bare agent cmd", () => {
    const residualAgentCmd: TerminalPaneAgent = {
      id: "legacy-cursor",
      label: "Legacy Cursor",
      command: "agent",
      iconType: "built-in",
    };
    const match = resolveAgentForTitle("cursor-agent --yolo", [residualAgentCmd, cursorAgent]);
    expect(match?.id).toBe("cursor");
  });

  it("S9/S10/S11 — resolves contested bare agent via contestedOwners", () => {
    expect(
      getTerminalDisplayMeta({
        baseTitle: "shell",
        dynamicTitle: "agent --foo",
        configuredAgents: agents,
        contestedOwners: { agent: "grok-build" },
      }).toolbarAgent?.id,
    ).toBe("grok-build");

    expect(
      getTerminalDisplayMeta({
        baseTitle: "shell",
        dynamicTitle: "agent",
        configuredAgents: agents,
        contestedOwners: { agent: "cursor" },
      }).toolbarAgent?.id,
    ).toBe("cursor");

    expect(
      getTerminalDisplayMeta({
        baseTitle: "shell",
        dynamicTitle: "agent",
        configuredAgents: agents,
        contestedOwners: { agent: "unknown" },
      }).toolbarAgent,
    ).toBeUndefined();
  });

  it("S11 — does not reuse a persisted brand when contested ownership is unknown", () => {
    for (const baseTitle of ["Cursor Agent", "Grok Build"]) {
      expect(
        getTerminalDisplayMeta({
          baseTitle,
          dynamicTitle: "agent",
          configuredAgents: agents,
          contestedOwners: { agent: "unknown" },
        }),
      ).toEqual({
        displayTitle: "agent",
        toolbarAgent: undefined,
      });
    }
  });

  it("matches command lines with executable paths or path-valued arguments", () => {
    for (const dynamicTitle of [
      "/Users/me/.grok/bin/grok --always-approve",
      "'/Users/me/Grok Build/grok' --always-approve",
      "grok --cwd /tmp/project",
    ]) {
      expect(resolveAgentForTitle(dynamicTitle, agents)?.id).toBe("grok-build");
    }
    expect(resolveAgentForTitle("/opt/bin/cursor-agent --yolo", agents)?.id).toBe("cursor");
    expect(resolveAgentForTitle("/Users/me/.grok/bin/grok", agents)?.id).toBe("grok-build");
    expect(resolveAgentForTitle("/opt/bin/cursor-agent", agents)?.id).toBe("cursor");
    expect(
      resolveAgentForTitle(
        "/Users/me/.local/share/cursor-agent/versions/2026.07/agent",
        agents,
      )?.id,
    ).toBe("cursor");
    expect(resolveAgentForTitle("/Users/me/.grok/versions/current/agent", agents)?.id).toBe(
      "grok-build",
    );
  });

  it("matches platform-packaged Grok binaries (grok-* prefix)", () => {
    for (const dynamicTitle of [
      "grok-macos-aarc",
      "grok-macos-aarc --always-approve",
      "grok-linux-x86_64 --always-approve",
      "grok-windows-x86_64.exe",
      "/Users/me/.grok/bin/grok-macos-aarc",
      "/Users/me/.grok/bin/grok-macos-aarc --always-approve",
      "/Users/me/.grok/versions/current/grok-macos-aarc",
    ]) {
      expect(resolveAgentForTitle(dynamicTitle, agents)?.id).toBe("grok-build");
      expect(
        getTerminalDisplayMeta({
          baseTitle: "shell",
          dynamicTitle,
          configuredAgents: agents,
        }).toolbarAgent?.id,
      ).toBe("grok-build");
    }
  });

  it("keeps bare filesystem paths as path titles", () => {
    expect(resolveAgentForTitle("/Users/me/projects/grok", agents)).toBeUndefined();
  });

  it("matches pipe agents via pipeCommand, not bare echo", () => {
    const pipeAgent: TerminalPaneAgent = {
      id: "custom-pipe",
      label: "Custom Pipe",
      command: "echo",
      pipeCommand: "myagent",
      iconType: "custom",
    };
    expect(resolveAgentForTitle("echo hello | myagent", [pipeAgent])?.id).toBe("custom-pipe");
    expect(resolveAgentForTitle("echo hello", [pipeAgent])).toBeUndefined();
    expect(resolveAgentForTitle('echo "a|b" | myagent', [pipeAgent])?.id).toBe("custom-pipe");
  });

  it("does not treat path-only titles ending in agent as contested freehand", () => {
    expect(
      getTerminalDisplayMeta({
        baseTitle: "Cursor Agent",
        dynamicTitle: "/tmp/workspace/agent",
        configuredAgents: agents,
        agent: cursorAgent,
        contestedOwners: { agent: "unknown" },
      }).toolbarAgent?.id,
    ).toBe("cursor");
  });
});
