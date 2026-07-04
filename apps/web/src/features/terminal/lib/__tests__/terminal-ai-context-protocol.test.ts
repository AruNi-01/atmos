// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  expandPromptWithTerminalSelectionContexts,
  formatSideChatProtocol,
  formatTerminalSelectionProtocol,
  hasKnownSideChatCommand,
  normalizeTerminalSelectionText,
  parseSideChatProtocolToken,
  parseTerminalSelectionProtocolToken,
  stripTerminalAiProtocolTokens,
  type TerminalPromptContext,
} from "../terminal-ai-context-protocol";

describe("terminal AI context protocol", () => {
  const selectionContext: TerminalPromptContext = {
    kind: "terminal_selection",
    contextId: "selection-123",
    text: "error: missing file",
    sourceSessionId: "source-session",
    sourceTmuxWindowName: "main",
    selectedAtMs: 1760000000000,
    lineCount: 1,
    byteCount: 19,
    truncated: false,
  };

  it("formats and parses protocol tokens", () => {
    expect(parseTerminalSelectionProtocolToken(formatTerminalSelectionProtocol("selection-123"))).toEqual({
      contextId: "selection-123",
    });
    expect(parseSideChatProtocolToken(formatSideChatProtocol("capture-123"))).toEqual({
      contextId: "capture-123",
    });
    expect(parseSideChatProtocolToken("/side")).toBeNull();
  });

  it("does not treat raw /side text as a known side chat command", () => {
    expect(hasKnownSideChatCommand("please explain /side", [selectionContext])).toBe(false);
  });

  it("requires a known context id for side chat protocol activation", () => {
    expect(hasKnownSideChatCommand(formatSideChatProtocol("missing"), [selectionContext])).toBe(false);
    expect(hasKnownSideChatCommand(formatSideChatProtocol("selection-123"), [selectionContext])).toBe(true);
  });

  it("expands selection chips into explicit context blocks", () => {
    const text = `${formatTerminalSelectionProtocol("selection-123")} why?`;
    const expanded = expandPromptWithTerminalSelectionContexts({
      contexts: [selectionContext],
      text,
    });

    expect(expanded).toContain("The user selected this terminal text as context:");
    expect(expanded).toContain("error: missing file");
    expect(expanded).toContain("User prompt:\n\nwhy?");
  });

  it("preserves unknown protocol-looking text when expanding prompts", () => {
    expect(
      expandPromptWithTerminalSelectionContexts({
        contexts: [],
        text: "please keep atmos://side-chat/example in docs",
      }),
    ).toBe("please keep atmos://side-chat/example in docs");
    expect(
      expandPromptWithTerminalSelectionContexts({
        contexts: [],
        text: "please keep atmos://terminal-selection/example in docs",
      }),
    ).toBe("please keep atmos://terminal-selection/example in docs");
  });

  it("strips resolved context tokens without removing unknown protocol-looking text", () => {
    const text = [
      formatTerminalSelectionProtocol("selection-123"),
      "compare",
      "atmos://terminal-selection/example",
      "and",
      "atmos://side-chat/example",
    ].join(" ");
    const expanded = expandPromptWithTerminalSelectionContexts({
      contexts: [selectionContext],
      text,
    });

    expect(expanded).toContain("The user selected this terminal text as context:");
    expect(expanded).toContain("error: missing file");
    expect(expanded).toContain(
      "User prompt:\n\ncompare atmos://terminal-selection/example and atmos://side-chat/example",
    );
  });

  it("strips terminal AI protocol tokens from user prompt text", () => {
    const text = `${formatTerminalSelectionProtocol("selection-123")} ${formatSideChatProtocol("selection-123")} explain`;
    expect(stripTerminalAiProtocolTokens(text)).toBe("explain");
  });

  it("normalizes selected terminal text", () => {
    const normalized = normalizeTerminalSelectionText("\u001b[31merror\u001b[0m\r\nnext\u0007");

    expect(normalized.text).toBe("error\nnext");
    expect(normalized.lineCount).toBe(2);
    expect(normalized.truncated).toBe(false);
  });
});
