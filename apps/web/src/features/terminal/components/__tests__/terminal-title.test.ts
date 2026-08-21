// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import {
  appendNativeOscTitle,
  extractStableCenterTabOscTitle,
  getTerminalDisplayMeta,
  isDynamicTitleDowngrade,
  isTmuxIndexTitle,
  isShellPreexecCommandOscTitle,
  MAX_NATIVE_OSC_TITLE_CHARS,
  nextCenterTabSessionOscTitle,
  nextOscTitleAfterIncoming,
  resolveAgentForTitle,
  sanitizeNativeOscTitle,
  shouldClearNativeOscOnCmdEnd,
  ATMOS_REATTACH_TITLE_OSC,
  ATMOS_SHELL_TITLE_OSC,
} from "@atmos/shared/terminal";
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

  it("keeps the pane agent title when reattach injects a bare process name", () => {
    expect(
      getTerminalDisplayMeta({
        baseTitle: "1",
        dynamicTitle: "agy",
        agent: hermesAgent,
      }),
    ).toMatchObject({
      displayTitle: "Hermes Agent",
      toolbarAgent: hermesAgent,
    });
  });

  it("classifies bare process titles for display fallback only (does not block CMD_START writes)", () => {
    // Pure helper for display/meta — must NOT be used to drop legitimate
    // shell CMD_START updates (e.g. "npm run dev" → "vim").
    expect(isDynamicTitleDowngrade("Hermes Agent", "agy")).toBe(true);
    expect(isDynamicTitleDowngrade(".../foo/bar", "agy")).toBe(false);
    expect(isDynamicTitleDowngrade("agy", "node")).toBe(false);
    expect(isDynamicTitleDowngrade("OpenSource/atmos", "1")).toBe(true);
    expect(isDynamicTitleDowngrade(".../foo/bar", "6")).toBe(true);
    expect(isTmuxIndexTitle("1")).toBe(true);
    expect(isTmuxIndexTitle("6")).toBe(true);
    expect(isTmuxIndexTitle("OpenSource/atmos")).toBe(false);
    expect(isTmuxIndexTitle("npm")).toBe(false);
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
      ).toMatchObject({
        displayTitle: "agent",
        primaryTitle: "agent",
        oscSuffix: "",
        toolbarAgent: undefined,
      });
    }
  });

  it("splits primary title and OSC suffix for toolbar marquee", () => {
    const meta = getTerminalDisplayMeta({
      baseTitle: "Claude Code",
      dynamicTitle: "claude",
      agent: { id: "claude", label: "Claude Code", command: "claude", iconType: "built-in" },
      oscTitle: "debugging a very long session topic for marquee",
    });
    expect(meta.primaryTitle).toBe("Claude Code");
    expect(meta.oscSuffix).toBe("debugging a very long session topic for marquee");
    expect(meta.displayTitle).toBe(
      "Claude Code | debugging a very long session topic for marquee",
    );
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

describe("native OSC 0/2 title suffix (APP-047)", () => {
  it("sanitizes control characters and collapses whitespace", () => {
    expect(sanitizeNativeOscTitle("  Project\t|\nWorking\x1b\x07 ")).toBe("Project | Working");
    expect(sanitizeNativeOscTitle("   ")).toBe("");
    expect(sanitizeNativeOscTitle(undefined)).toBe("");
  });

  it("caps long native titles", () => {
    const long = "a".repeat(MAX_NATIVE_OSC_TITLE_CHARS + 20);
    expect(sanitizeNativeOscTitle(long).length).toBe(MAX_NATIVE_OSC_TITLE_CHARS);
  });

  it("appends OSC title with | after the auto display title", () => {
    expect(
      getTerminalDisplayMeta({
        baseTitle: "Claude Code",
        dynamicTitle: "claude",
        configuredAgents: agents,
        agent: { id: "claude", label: "Claude Code", command: "claude", iconType: "built-in" },
        oscTitle: "debugging auth",
      }),
    ).toMatchObject({
      displayTitle: "Claude Code | debugging auth",
      toolbarAgent: expect.objectContaining({ id: "claude" }),
    });
  });

  it("hides agent brand text while keeping agent and OSC alone (no pipe)", () => {
    const meta = getTerminalDisplayMeta({
      baseTitle: "Claude Code",
      dynamicTitle: "claude",
      configuredAgents: agents,
      agent: { id: "claude", label: "Claude Code", command: "claude", iconType: "built-in" },
      oscTitle: "debugging auth",
      showAgentName: false,
    });
    expect(meta).toMatchObject({
      primaryTitle: "",
      oscSuffix: "debugging auth",
      displayTitle: "debugging auth",
      toolbarAgent: expect.objectContaining({ id: "claude" }),
    });
    expect(meta.displayTitle).not.toContain("|");
  });

  it("shows OSC alone when auto title is empty", () => {
    expect(appendNativeOscTitle("", "session topic")).toBe("session topic");
    expect(
      getTerminalDisplayMeta({
        baseTitle: undefined,
        dynamicTitle: undefined,
        oscTitle: "session topic",
      }).displayTitle,
    ).toBe("session topic");
  });

  it("never uses OSC text for agent detection", () => {
    const meta = getTerminalDisplayMeta({
      baseTitle: "1",
      dynamicTitle: "codex",
      configuredAgents: agents,
      agent: { id: "codex", label: "Codex", command: "codex", iconType: "built-in" },
      // Looks like another agent brand — must not rebrand the pane.
      oscTitle: "Hermes Agent",
    });
    expect(meta.displayTitle).toBe("Codex | Hermes Agent");
    expect(meta.toolbarAgent?.id).toBe("codex");
    expect(meta.toolbarAgent?.id).not.toBe("hermes");
  });

  it("suppresses OSC when custom label is set", () => {
    expect(
      getTerminalDisplayMeta({
        baseTitle: "Claude Code",
        dynamicTitle: "claude",
        configuredAgents: agents,
        agent: { id: "claude", label: "Claude Code", command: "claude", iconType: "built-in" },
        oscTitle: "debugging auth",
        suppressOscTitle: true,
      }).displayTitle,
    ).toBe("Claude Code");
    expect(appendNativeOscTitle("My Pane", "debugging auth", true)).toBe("My Pane");
  });

  it("drops the suffix when OSC is cleared", () => {
    expect(
      getTerminalDisplayMeta({
        baseTitle: "Claude Code",
        dynamicTitle: "claude",
        agent: { id: "claude", label: "Claude Code", command: "claude", iconType: "built-in" },
        oscTitle: "",
      }).displayTitle,
    ).toBe("Claude Code");
  });

  // Documents clear-on-empty / post-clear composition (S6 unit; S7/S8 are inspection).
  it("appendNativeOscTitle returns auto-only after clear (empty/undefined osc)", () => {
    expect(appendNativeOscTitle("Claude Code", "debugging auth")).toBe(
      "Claude Code | debugging auth",
    );
    expect(appendNativeOscTitle("Claude Code", "")).toBe("Claude Code");
    expect(appendNativeOscTitle("Claude Code", undefined)).toBe("Claude Code");
    expect(appendNativeOscTitle("Claude Code", "   ")).toBe("Claude Code");
  });

  it("filters shell user@host:cwd and path-only OSC noise", () => {
    const shellTitle =
      "aarynlu@AarynLuDeMacBook-Air:~/.atmos/workspaces/atmos/abra";
    expect(
      getTerminalDisplayMeta({
        baseTitle: "1",
        dynamicTitle: ".../atmos/abra",
        oscTitle: shellTitle,
      }).displayTitle,
    ).toBe(".../atmos/abra");
    expect(
      getTerminalDisplayMeta({
        baseTitle: "1",
        dynamicTitle: "/Users/me/proj",
        oscTitle: "/Users/me/proj",
      }).displayTitle,
    ).toBe("/Users/me/proj");
    expect(
      appendNativeOscTitle("atmos/abra", shellTitle),
    ).toBe("atmos/abra");
  });

  it("filters shell builtins/navigation (ls) but keeps program CLIs (git/npm)", () => {
    // Shells themselves + builtins / listing / cwd helpers — no flash.
    for (const cmd of ["zsh", "bash", "fish", "ls", "ll", "pwd", "cd", "echo", "clear", "cat"]) {
      expect(
        getTerminalDisplayMeta({
          baseTitle: "1",
          dynamicTitle: ".../atmos/abra",
          oscTitle: cmd,
        }).oscSuffix,
      ).toBe("");
    }
    expect(
      getTerminalDisplayMeta({
        baseTitle: "1",
        dynamicTitle: ".../atmos/abra",
        oscTitle: "ls -la",
      }).displayTitle,
    ).toBe(".../atmos/abra");

    // Program CLIs can still surface as running-process titles.
    expect(
      getTerminalDisplayMeta({
        baseTitle: "1",
        dynamicTitle: ".../atmos/abra",
        oscTitle: "git",
      }).oscSuffix,
    ).toBe("git");
    expect(
      getTerminalDisplayMeta({
        baseTitle: "1",
        dynamicTitle: ".../atmos/abra",
        oscTitle: "npm",
      }).oscSuffix,
    ).toBe("npm");

    // Multi-word agent session topics still show.
    expect(
      getTerminalDisplayMeta({
        baseTitle: "Claude Code",
        dynamicTitle: "claude",
        agent: { id: "claude", label: "Claude Code", command: "claude", iconType: "built-in" },
        oscTitle: "debugging auth",
      }).oscSuffix,
    ).toBe("debugging auth");
    // Title-Case agent status words are not treated as shell commands.
    expect(
      getTerminalDisplayMeta({
        baseTitle: "Claude Code",
        dynamicTitle: "claude",
        agent: { id: "claude", label: "Claude Code", command: "claude", iconType: "built-in" },
        oscTitle: "Compacting",
      }).oscSuffix,
    ).toBe("Compacting");
  });

  it("filters shell preexec pipelines and process inspection commands", () => {
    const pipeline =
      "ps aux | grep --color=auto -i iris | grep --color=auto -v grep;";
    expect(
      getTerminalDisplayMeta({
        baseTitle: "1",
        dynamicTitle: ".../OpenSource/atmos",
        oscTitle: pipeline,
      }).displayTitle,
    ).toBe(".../OpenSource/atmos");
    expect(
      getTerminalDisplayMeta({
        baseTitle: "1",
        dynamicTitle: ".../OpenSource/atmos",
        oscTitle: "ps aux",
      }).oscSuffix,
    ).toBe("");
    expect(
      getTerminalDisplayMeta({
        baseTitle: "1",
        dynamicTitle: ".../OpenSource/atmos",
        oscTitle: "lsof -i -P",
      }).oscSuffix,
    ).toBe("");
    // Chained / redirected command lines are never agent topics.
    for (const cmd of [
      "echo hi && ls",
      "cat file > out",
      "echo $(date)",
      "true || false",
    ]) {
      expect(
        getTerminalDisplayMeta({
          baseTitle: "1",
          dynamicTitle: ".../proj",
          oscTitle: cmd,
        }).oscSuffix,
      ).toBe("");
    }
  });

  it("clears previous OSC when an ignored shell command arrives, keeps agent topics on path redraw", () => {
    const pipeline =
      "ps aux | grep --color=auto -i iris | grep --color=auto -v grep;";
    expect(isShellPreexecCommandOscTitle(pipeline)).toBe(true);
    expect(isShellPreexecCommandOscTitle("debugging auth")).toBe(false);
    expect(isShellPreexecCommandOscTitle("fix src/api")).toBe(false);

    // Ignored shell command (even after an agent topic) → empty. The command
    // is not shown, and any previous suffix must not stick.
    expect(nextOscTitleAfterIncoming("debugging auth", "ls -la")).toBeUndefined();
    expect(nextOscTitleAfterIncoming("debugging auth", pipeline)).toBeUndefined();
    expect(nextOscTitleAfterIncoming("git", "ps aux")).toBeUndefined();
    expect(nextOscTitleAfterIncoming(undefined, "pwd")).toBeUndefined();

    // Idle user@host:cwd noise after a finished shell command → clear suffix.
    expect(
      nextOscTitleAfterIncoming(
        pipeline,
        "aarynlu@Host:~/OpenSource/atmos",
      ),
    ).toBeUndefined();
    // Path/host redraw after a real agent topic → keep topic (agent may not
    // re-emit immediately; prompt redraw must not erase it while still running).
    // Shell CMD_END (9999) is what clears after the agent exits — see below.
    expect(
      nextOscTitleAfterIncoming(
        "debugging auth",
        "aarynlu@Host:~/OpenSource/atmos",
      ),
    ).toBe("debugging auth");
    // Explicit empty still clears.
    expect(nextOscTitleAfterIncoming("debugging auth", "")).toBeUndefined();
    expect(nextOscTitleAfterIncoming("debugging auth", undefined)).toBeUndefined();
    // New meaningful topic replaces previous.
    expect(nextOscTitleAfterIncoming(pipeline, "fix auth")).toBe("fix auth");
  });

  it("clears native OSC on real shell CMD_END, not on reattach inject", () => {
    // APP-047 S7: agent exit → OSC 9999 CMD_END clears the suffix.
    // Reattach OSC 9998 must not wipe topics restored for the session.
    expect(shouldClearNativeOscOnCmdEnd(ATMOS_SHELL_TITLE_OSC)).toBe(true);
    expect(shouldClearNativeOscOnCmdEnd(ATMOS_REATTACH_TITLE_OSC)).toBe(false);
    // Simulates Terminal applyDynamicTitleCmdEnd clear path for 9999.
    expect(nextOscTitleAfterIncoming("debugging auth", undefined)).toBeUndefined();
    expect(nextOscTitleAfterIncoming("claude", undefined)).toBeUndefined();
    expect(nextOscTitleAfterIncoming("codex", undefined)).toBeUndefined();
  });

  it("keeps multi-word OSC topics that contain slashes (not bare paths)", () => {
    expect(
      getTerminalDisplayMeta({
        baseTitle: "Claude Code",
        dynamicTitle: "claude",
        agent: { id: "claude", label: "Claude Code", command: "claude", iconType: "built-in" },
        oscTitle: "fix src/api auth",
      }).oscSuffix,
    ).toBe("fix src/api auth");
  });

  it("hides OSC that only repeats the agent command or brand", () => {
    const claude = {
      id: "claude",
      label: "Claude Code",
      command: "claude",
      iconType: "built-in" as const,
    };
    expect(
      getTerminalDisplayMeta({
        baseTitle: "Claude Code",
        dynamicTitle: "claude",
        agent: claude,
        configuredAgents: [claude],
        oscTitle: "claude",
      }).displayTitle,
    ).toBe("Claude Code");
    expect(
      getTerminalDisplayMeta({
        baseTitle: "Claude Code",
        dynamicTitle: "claude",
        agent: claude,
        configuredAgents: [claude],
        oscTitle: "Claude Code",
      }).displayTitle,
    ).toBe("Claude Code");
    // Meaningful session topic still appends.
    expect(
      getTerminalDisplayMeta({
        baseTitle: "Claude Code",
        dynamicTitle: "claude",
        agent: claude,
        configuredAgents: [claude],
        oscTitle: "debugging auth",
      }).displayTitle,
    ).toBe("Claude Code | debugging auth");
  });
});

describe("center-tab stable OSC session topic", () => {
  it("extracts Grok session name and drops spinner/activity/brand", () => {
    expect(
      extractStableCenterTabOscTitle(
        "Action Required - ⠋ - Responding - Optimize Terminal Tab - grok",
      ),
    ).toBe("Optimize Terminal Tab");
    expect(extractStableCenterTabOscTitle("Thinking - proj - grok-3 - workspace - grok")).toBe(
      "proj",
    );
    expect(extractStableCenterTabOscTitle("⠋ - Responding - grok")).toBe("");
    expect(extractStableCenterTabOscTitle("grok")).toBe("");
  });

  it("keeps plain session topics and sticky realtime updates", () => {
    expect(extractStableCenterTabOscTitle("debugging auth")).toBe("debugging auth");
    expect(nextCenterTabSessionOscTitle(undefined, "debugging auth")).toBe("debugging auth");
    expect(nextCenterTabSessionOscTitle("debugging auth", "Responding - grok")).toBe(
      "debugging auth",
    );
    expect(nextCenterTabSessionOscTitle("debugging auth", "")).toBeUndefined();
    expect(nextCenterTabSessionOscTitle("old", "new session topic")).toBe("new session topic");
  });
});
