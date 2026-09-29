// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { CodeAgentCustomEntry } from "@atmos/api-types/ws/dto/settings";
import { mergeTerminalLaunchAgents } from "./terminal-launch-agents";

const builtins = [
  {
    id: "claude",
    label: "Claude Code",
    cmd: "claude",
    params: "--print",
    interactiveParams: "",
    yoloParams: "--print --yolo",
    yoloInteractiveParams: "--dangerously-skip-permissions",
  },
  {
    id: "codex",
    label: "Codex",
    cmd: "codex",
    params: "exec",
    interactiveParams: "",
    yoloInteractiveParams: "",
  },
];

function custom(partial: Partial<CodeAgentCustomEntry> & Pick<CodeAgentCustomEntry, "id">): CodeAgentCustomEntry {
  return {
    cmd: "",
    flags: "",
    label: "",
    ...partial,
  };
}

describe("terminal launch agents", () => {
  test("uses built-in interactive launch commands when nothing is customized", () => {
    expect(mergeTerminalLaunchAgents([], builtins)).toEqual([
      {
        command: "claude --dangerously-skip-permissions",
        iconType: "built-in",
        id: "claude",
        label: "Claude Code",
      },
      {
        command: "codex exec",
        iconType: "built-in",
        id: "codex",
        label: "Codex",
      },
    ]);
  });

  test("hides disabled agents and applies user command overrides", () => {
    expect(mergeTerminalLaunchAgents([
      custom({ id: "codex", enabled: false, label: "Codex", cmd: "codex" }),
      custom({ id: "claude", label: "Claude", cmd: "claude-dev", interactiveFlags: "--resume" }),
      custom({ id: "mine", label: "Mine", cmd: "mine", flags: "--fast" }),
      custom({ id: "blank", label: "", cmd: "nope" }),
    ], builtins)).toEqual([
      {
        command: "claude-dev --resume",
        iconType: "built-in",
        id: "claude",
        label: "Claude",
      },
      {
        command: "mine --fast",
        iconType: "custom",
        id: "mine",
        label: "Mine",
      },
    ]);
  });
});
