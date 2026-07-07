// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import type { TerminalRef } from "@/features/terminal/components/Terminal";
import { sendTuiFollowUpPrompt } from "@/features/terminal/lib/terminal-agent-run-delivery";

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
