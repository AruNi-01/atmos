// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import type { TerminalRef } from "@/features/terminal/components/Terminal";
import {
  deliverTerminalAgentLaunch,
  sendTuiFollowUpPrompt,
} from "@/features/terminal/lib/terminal-agent-run-delivery";
import { wrapBracketedPaste } from "@/features/terminal/lib/terminal-runtime-utils";

function createTerminalRefMock() {
  const calls: Array<{ method: "sendText" | "sendEnter"; value?: string }> = [];
  const terminalRef = {
    sendText: (value: string) => {
      calls.push({ method: "sendText", value });
    },
    sendEnter: () => {
      calls.push({ method: "sendEnter" });
    },
  } as unknown as TerminalRef;
  return { terminalRef, calls };
}

describe("sendTuiFollowUpPrompt", () => {
  it("submits single-line Hermes prompts with a trailing carriage return", () => {
    const { terminalRef, calls } = createTerminalRefMock();

    sendTuiFollowUpPrompt(terminalRef, "fix this", { agentId: "hermes" });

    expect(calls).toEqual([{ method: "sendText", value: "fix this\r" }]);
  });

  it("uses bracketed paste and Enter for multiline prompts", () => {
    const { terminalRef, calls } = createTerminalRefMock();

    sendTuiFollowUpPrompt(terminalRef, "line one\nline two", { agentId: "hermes" });

    expect(calls[0]?.method).toBe("sendText");
    expect(calls[0]?.value).toContain("\x1b[200~line one\rline two\x1b[201~");
    expect(calls.length).toBe(1);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(calls).toEqual([
          { method: "sendText", value: calls[0]?.value },
          { method: "sendEnter" },
        ]);
        resolve();
      }, 100);
    });
  });
});

describe("deliverTerminalAgentLaunch", () => {
  it("submits single-line launches with a trailing carriage return", () => {
    const { terminalRef, calls } = createTerminalRefMock();

    deliverTerminalAgentLaunch(terminalRef, "agent --yolo 'fix this'");

    expect(calls).toEqual([
      { method: "sendText", value: "agent --yolo 'fix this'\r" },
    ]);
  });

  it("submits multiline launches as one bracketed-paste write plus Enter", () => {
    const { terminalRef, calls } = createTerminalRefMock();
    const launch = "agent --yolo 'line one\n```diff\n+ new\n```'";
    const submitted: string[] = [];

    deliverTerminalAgentLaunch(terminalRef, launch, true, () => {
      submitted.push("submitted");
    });

    expect(calls).toEqual([
      {
        method: "sendText",
        value: "\x1b[200~agent --yolo 'line one\r```diff\r+ new\r```'\x1b[201~\r",
      },
    ]);
    expect(submitted).toEqual(["submitted"]);
  });

  it("submits long single-line launches via bracketed paste plus Enter", () => {
    const { terminalRef, calls } = createTerminalRefMock();
    const prompt = "x".repeat(2000);
    const launch = `agent --yolo '${prompt}'`;

    deliverTerminalAgentLaunch(terminalRef, launch);

    expect(calls).toEqual([
      { method: "sendText", value: `\x1b[200~${launch}\x1b[201~\r` },
    ]);
  });

  it("prefills multiline launches with bracketed paste and no Enter", () => {
    const { terminalRef, calls } = createTerminalRefMock();

    deliverTerminalAgentLaunch(terminalRef, "echo 'a\nb'", false);

    expect(calls).toEqual([
      {
        method: "sendText",
        value: "\x1b[200~echo 'a\rb'\x1b[201~",
      },
    ]);
  });
});

describe("wrapBracketedPaste", () => {
  it("strips ESC bytes so paste mode cannot end early", () => {
    expect(wrapBracketedPaste("before\x1b[201~after")).toBe(
      "\x1b[200~before[201~after\x1b[201~",
    );
  });
});
