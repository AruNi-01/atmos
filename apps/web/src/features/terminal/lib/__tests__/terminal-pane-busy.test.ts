import { describe, expect, test } from "bun:test";
import { isIdleCwdTitle } from "@atmos/shared/terminal";
import {
  hasNonIdleTerminalPanes,
  isIdleShellCommand,
  isTerminalPaneNonIdle,
} from "../terminal-grid-utils";

describe("isIdleShellCommand", () => {
  test("treats common shells as idle", () => {
    expect(isIdleShellCommand("zsh")).toBe(true);
    expect(isIdleShellCommand("/bin/bash")).toBe(true);
    expect(isIdleShellCommand("fish")).toBe(true);
  });

  test("treats running programs as non-idle", () => {
    expect(isIdleShellCommand("node")).toBe(false);
    expect(isIdleShellCommand("claude")).toBe(false);
    expect(isIdleShellCommand(null)).toBe(false);
    expect(isIdleShellCommand("")).toBe(false);
  });
});

describe("isIdleCwdTitle", () => {
  test("treats cwd / shortened cwd as idle", () => {
    expect(isIdleCwdTitle("/Users/me/project")).toBe(true);
    expect(isIdleCwdTitle(".../atmos/persian")).toBe(true);
    expect(isIdleCwdTitle("OpenSource/atmos")).toBe(true);
  });

  test("does not treat agent/CLI binaries as cwd", () => {
    expect(isIdleCwdTitle("/opt/homebrew/bin/claude")).toBe(false);
    expect(isIdleCwdTitle("/Users/me/.grok/bin/grok")).toBe(false);
    expect(isIdleCwdTitle("npm run /tmp")).toBe(false);
    expect(isIdleCwdTitle("claude")).toBe(false);
  });
});

describe("isTerminalPaneNonIdle", () => {
  test("idle when there is no tmux window yet", () => {
    expect(
      isTerminalPaneNonIdle({ dynamicTitle: "npm run dev", label: "1" }, null),
    ).toBe(false);
  });

  test("idle when cwd title and tmux list is unavailable", () => {
    expect(
      isTerminalPaneNonIdle(
        { tmuxWindowName: "1", dynamicTitle: "/Users/me/project", label: "1" },
        null,
      ),
    ).toBe(false);
  });

  test("non-idle when cwd title is stale but tmux reports a program", () => {
    expect(
      isTerminalPaneNonIdle(
        { tmuxWindowName: "1", dynamicTitle: "/Users/me/project", label: "1" },
        [{ name: "1", current_command: "node" }],
      ),
    ).toBe(true);
  });

  test("idle when cwd title and tmux foreground is a shell", () => {
    expect(
      isTerminalPaneNonIdle(
        { tmuxWindowName: "1", dynamicTitle: "/Users/me/project", label: "1" },
        [{ name: "1", current_command: "zsh" }],
      ),
    ).toBe(false);
  });

  test("non-idle when title is a command even if tmux still shows a shell", () => {
    expect(
      isTerminalPaneNonIdle(
        { tmuxWindowName: "1", dynamicTitle: "node", label: "1" },
        [{ name: "1", current_command: "zsh" }],
      ),
    ).toBe(true);
  });

  test("non-idle when a command is running", () => {
    expect(
      isTerminalPaneNonIdle(
        { tmuxWindowName: "1", dynamicTitle: "npm run dev", label: "1" },
        [{ name: "1", current_command: "node" }],
      ),
    ).toBe(true);
  });

  test("non-idle when tmux list is unavailable and title is not a cwd", () => {
    expect(
      isTerminalPaneNonIdle(
        { tmuxWindowName: "1", dynamicTitle: "npm run dev", label: "1" },
        null,
      ),
    ).toBe(true);
  });

  test("non-idle for agent executable paths even without tmux", () => {
    expect(
      isTerminalPaneNonIdle(
        { tmuxWindowName: "1", dynamicTitle: "/opt/homebrew/bin/claude", label: "1" },
        null,
      ),
    ).toBe(true);
  });

  test("matches window by label or index", () => {
    expect(
      isTerminalPaneNonIdle(
        { tmuxWindowName: "2", dynamicTitle: "claude", label: "Claude" },
        [{ name: "Claude", index: 2, current_command: "claude" }],
      ),
    ).toBe(true);
  });

  test("prefers namespaced tmux window names over a colliding numeric label", () => {
    expect(
      isTerminalPaneNonIdle(
        {
          tmuxWindowName: "cs__space-abc__1",
          dynamicTitle: "claude",
          label: "1",
        },
        [
          { name: "1", index: 1, current_command: "zsh" },
          { name: "cs__space-abc__1", index: 2, current_command: "claude" },
        ],
      ),
    ).toBe(true);
  });
});

describe("hasNonIdleTerminalPanes", () => {
  test("returns false when all panes are idle", () => {
    expect(
      hasNonIdleTerminalPanes(
        [
          { tmuxWindowName: "1", dynamicTitle: "/tmp", label: "1" },
          { tmuxWindowName: "2", dynamicTitle: "zsh", label: "2" },
        ],
        [
          { name: "1", current_command: "zsh" },
          { name: "2", current_command: "bash" },
        ],
      ),
    ).toBe(false);
  });

  test("returns true when any pane is non-idle", () => {
    expect(
      hasNonIdleTerminalPanes(
        [
          { tmuxWindowName: "1", dynamicTitle: "/tmp", label: "1" },
          { tmuxWindowName: "2", dynamicTitle: "npm run dev", label: "2" },
        ],
        [
          { name: "1", current_command: "zsh" },
          { name: "2", current_command: "node" },
        ],
      ),
    ).toBe(true);
  });
});
