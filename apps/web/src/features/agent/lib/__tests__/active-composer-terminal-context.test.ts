import { describe, expect, it } from "bun:test";
import {
  addTerminalSelectionAsContext,
  insertAiContextForInstanceKey,
  insertFileMentionForInstanceKey,
  registerActiveAgentComposer,
} from "@/features/agent/lib/agent/active-composer";
import type { TerminalSelectionSnapshot } from "@/features/terminal/types";

function snapshot(text: string): TerminalSelectionSnapshot {
  return {
    id: "sel-1",
    text,
    selectedAtMs: 1,
    lineCount: 1,
    byteCount: text.length,
    truncated: false,
    anchor: { x: 0, y: 0 },
  };
}

describe("addTerminalSelectionAsContext", () => {
  it("inserts into the last focused chat composer before the terminal overlay", () => {
    const inserted: string[] = [];
    const overlayCalls: string[] = [];
    const unregister = registerActiveAgentComposer("ws-1", "p-1", "default", {
      setDraft: () => undefined,
      insertAiContext: (_kind, promptText) => {
        inserted.push(promptText);
      },
    });

    expect(
      addTerminalSelectionAsContext(snapshot("ls -la"), {
        addTerminalSelectionContext: (item) => overlayCalls.push(item.text),
      }),
    ).toBe(true);
    expect(inserted).toEqual(["ls -la"]);
    expect(overlayCalls).toEqual([]);
    unregister();
  });

  it("falls back to the terminal overlay when no chat composer is registered", () => {
    const overlayCalls: string[] = [];
    expect(
      addTerminalSelectionAsContext(snapshot("git status"), {
        addTerminalSelectionContext: (item) => overlayCalls.push(item.text),
      }),
    ).toBe(true);
    expect(overlayCalls).toEqual(["git status"]);
  });
});

describe("instance-key composer inserts", () => {
  it("routes file mention and doc selection to the matching Live session", () => {
    const mentions: string[] = [];
    const contexts: Array<{ kind: string; text: string }> = [];
    const unregister = registerActiveAgentComposer(
      "ws-1",
      "p-1",
      "default",
      {
        setDraft: () => undefined,
        insertAiContext: (kind, promptText) => {
          contexts.push({ kind, text: promptText });
        },
        insertFileMention: (path) => {
          mentions.push(path);
        },
      },
      "md-live:/tmp/note.md",
    );

    expect(insertFileMentionForInstanceKey("md-live:/tmp/note.md", "/tmp/note.md")).toBe(true);
    expect(insertAiContextForInstanceKey("md-live:/tmp/note.md", "doc-selection", "hello")).toBe(
      true,
    );
    expect(mentions).toEqual(["/tmp/note.md"]);
    expect(contexts).toEqual([{ kind: "doc-selection", text: "hello" }]);
    expect(insertFileMentionForInstanceKey("md-live:/other.md", "/other.md")).toBe(false);
    unregister();
  });
});
