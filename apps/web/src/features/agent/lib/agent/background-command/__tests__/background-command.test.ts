import { describe, expect, it } from "bun:test";
import {
  detectBackgroundCommand,
  isBackgroundPollTool,
  isLiveBackgroundToolCall,
} from "@/features/agent/lib/agent/background-command";

describe("background command adapters", () => {
  it("detects grok is_background without a [bg] title", () => {
    const detected = detectBackgroundCommand({
      name: "Execute",
      title: "Execute `count`",
      status: "running",
      input: { variant: "Bash", command: "count", is_background: true },
    }, "grok-build");
    expect(detected).toMatchObject({ command: "count", running: true });
  });

  it("detects grok background: true on the raw tool payload", () => {
    expect(detectBackgroundCommand({
      name: "Tool",
      title: "run_terminal_command",
      status: "running",
      input: { command: "count", background: true, timeout: 90000 },
    })).toMatchObject({ command: "count", running: true });
  });

  it("treats TaskOutput as a poll tool, not a live background command card", () => {
    const probe = {
      name: "TaskOutput",
      title: "Get task output: task-1",
      status: "running",
      input: { variant: "TaskOutput", task_ids: ["task-1"] },
    };
    expect(isBackgroundPollTool(probe, "grok-build")).toBe(true);
    expect(isLiveBackgroundToolCall(probe, "grok-build")).toBe(false);
  });

  it("detects claude run_in_background", () => {
    expect(detectBackgroundCommand({
      name: "Bash",
      status: "running",
      input: { command: "npm run dev", run_in_background: true },
    }, "claude-code")).toMatchObject({ command: "npm run dev", running: true });
  });
});
