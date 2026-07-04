// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  SIDE_CHAT_INLINE_PROMPT_MAX_LINES,
  buildSideChatContextFileContent,
  buildSideChatContextFilePath,
  buildSideChatPrompt,
  buildSideChatPromptWithContextFile,
  mergeSideChatRecords,
  shouldInlineSideChatPrompt,
  type LocalSideChatRecord,
} from "../terminal-side-chat";

function sideChatRecord(
  overrides: Partial<LocalSideChatRecord> & Pick<LocalSideChatRecord, "side_chat_id" | "workspace_id">,
): LocalSideChatRecord {
  return {
    side_chat_id: overrides.side_chat_id,
    workspace_id: overrides.workspace_id,
    project_name: null,
    workspace_name: null,
    source_pane_id: "pane-1",
    source_tmux_window_name: "window-1",
    source_surface_kind: "terminal_pane",
    source_surface_ref_json: null,
    side_tmux_window_name: "side-window-1",
    agent_ref_json: null,
    color_hex: "#06b6d4",
    status: "open",
    created_at: null,
    updated_at: null,
    isNew: false,
    sessionId: "session-server",
    ...overrides,
  };
}

describe("mergeSideChatRecords", () => {
  it("does not preserve local side chat state across workspace id collisions", () => {
    const current = sideChatRecord({
      side_chat_id: "side-collision",
      workspace_id: "workspace-old",
      hasSentInitialCommand: true,
      initialCommand: "old prompt\r",
      isNew: true,
      sessionId: "session-old",
    });
    const incoming = sideChatRecord({
      side_chat_id: "side-collision",
      workspace_id: "workspace-new",
      hasSentInitialCommand: false,
      initialCommand: undefined,
      isNew: false,
      sessionId: "session-new",
    });

    expect(mergeSideChatRecords([current], [incoming], "workspace-new")).toEqual([incoming]);
  });

  it("preserves local side chat state within the same workspace", () => {
    const current = sideChatRecord({
      side_chat_id: "side-stable",
      workspace_id: "workspace-1",
      hasSentInitialCommand: true,
      initialCommand: "local prompt\r",
      isNew: true,
      sessionId: "session-local",
    });
    const incoming = sideChatRecord({
      side_chat_id: "side-stable",
      workspace_id: "workspace-1",
      hasSentInitialCommand: false,
      initialCommand: undefined,
      isNew: false,
      sessionId: "session-server",
    });

    expect(mergeSideChatRecords([current], [incoming], "workspace-1")).toEqual([
      {
        ...incoming,
        hasSentInitialCommand: true,
        initialCommand: "local prompt\r",
        isNew: true,
        sessionId: "session-local",
      },
    ]);
  });
});

describe("side chat context prompt routing", () => {
  const capture = {
    workspace_id: "workspace-1",
    project_name: null,
    workspace_name: null,
    tmux_window_name: "main",
    tmux_window_index: 1,
    captured_lines: 2,
    captured_bytes: 48,
    prompt_budget_bytes: 4096,
    omitted_older_bytes: 0,
    omitted_middle_bytes: 0,
    truncated_bytes: false,
    text: "secret terminal context\nsecond captured line",
  };
  const selectedContext = {
    kind: "terminal_selection" as const,
    contextId: "selection-test",
    text: "selected stack trace line",
    sourceSessionId: "source-session",
    sourceTmuxWindowName: "main",
    selectedAtMs: 1760000000000,
    lineCount: 1,
    byteCount: 25,
    truncated: false,
  };

  it("treats thirty display lines as the inline cutoff", () => {
    const thirtyLines = Array.from(
      { length: SIDE_CHAT_INLINE_PROMPT_MAX_LINES },
      (_, index) => `line ${index + 1}`,
    ).join("\n");
    const thirtyOneLines = `${thirtyLines}\nline 31`;

    expect(shouldInlineSideChatPrompt(thirtyLines)).toBe(true);
    expect(shouldInlineSideChatPrompt(thirtyOneLines)).toBe(false);
  });

  it("builds a stable workspace-scoped context file path", () => {
    expect(
      buildSideChatContextFilePath({
        rootPath: "/repo/workspace/",
        workspaceId: "workspace:one",
        timestampMs: 1234567890,
      }),
    ).toBe("/repo/workspace/.atmos/tmp/context/workspace_one/side_1234567890.txt");
  });

  it("keeps long captured context out of the prompt when using a context file", () => {
    const directPrompt = buildSideChatPrompt({
      capture,
      sourceTmuxWindowName: "main",
      userPrompt: "What should I do next?",
    });
    const fileContent = buildSideChatContextFileContent({
      capture,
      sourceTmuxWindowName: "main",
    });
    const filePrompt = buildSideChatPromptWithContextFile({
      capture,
      contextFilePath: "/repo/.atmos/tmp/context/workspace-1/side_123.txt",
      sourceTmuxWindowName: "main",
      userPrompt: "What should I do next?",
    });

    expect(directPrompt).toContain("secret terminal context");
    expect(fileContent).toContain("secret terminal context");
    expect(filePrompt).toContain("/repo/.atmos/tmp/context/workspace-1/side_123.txt");
    expect(filePrompt).not.toContain("secret terminal context");
  });

  it("appends user-selected terminal context after captured side chat context", () => {
    const directPrompt = buildSideChatPrompt({
      capture,
      selectedContexts: [selectedContext],
      sourceTmuxWindowName: "main",
      userPrompt: "What should I do next?",
    });
    const captureIndex = directPrompt.indexOf("Captured terminal context:");
    const selectionIndex = directPrompt.indexOf("User-selected terminal context:");
    const promptIndex = directPrompt.indexOf("User prompt:");

    expect(captureIndex).toBeGreaterThanOrEqual(0);
    expect(selectionIndex).toBeGreaterThan(captureIndex);
    expect(promptIndex).toBeGreaterThan(selectionIndex);
    expect(directPrompt).toContain("selected stack trace line");
  });

  it("stores selected context in the side context file when the prompt uses a file", () => {
    const fileContent = buildSideChatContextFileContent({
      capture,
      selectedContexts: [selectedContext],
      sourceTmuxWindowName: "main",
    });
    const filePrompt = buildSideChatPromptWithContextFile({
      capture,
      contextFilePath: "/repo/.atmos/tmp/context/workspace-1/side_123.txt",
      selectedContexts: [selectedContext],
      sourceTmuxWindowName: "main",
      userPrompt: "What should I do next?",
    });

    expect(fileContent).toContain("secret terminal context");
    expect(fileContent).toContain("selected stack trace line");
    expect(filePrompt).toContain("It also includes terminal text explicitly selected by the user");
    expect(filePrompt).not.toContain("selected stack trace line");
  });
});
