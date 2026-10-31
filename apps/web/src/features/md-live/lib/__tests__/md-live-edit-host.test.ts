import { describe, expect, test } from "bun:test";
import {
  applyMdLiveAgentTool,
  finishMdLiveEditReview,
  type MdLiveStreamApi,
} from "../md-live-edit-host";
import { isMdLiveStreamLocked, unlockMdLiveStream } from "../md-live-stream-lock";

function fakeApi(initial = "hello world"): MdLiveStreamApi & {
  buffer: string;
  streamed: string;
  accepted: boolean;
} {
  let buffer = initial;
  let streamed = "";
  let active = false;
  let accepted = false;
  return {
    get buffer() {
      return buffer;
    },
    get streamed() {
      return streamed;
    },
    get accepted() {
      return accepted;
    },
    getMarkdown: () => buffer,
    getSelectionMarkdown: () => (buffer.includes("world") ? "world" : ""),
    selectAll: () => undefined,
    startStream: () => {
      if (active) return false;
      active = true;
      streamed = "";
      return true;
    },
    pushChunk: (token) => {
      streamed += token;
    },
    endStream: () => {
      buffer = streamed || buffer;
      active = false;
    },
    abortStream: () => {
      active = false;
      streamed = "";
    },
    acceptAllDiffs: () => {
      accepted = true;
    },
    clearDiffReview: () => undefined,
  };
}

describe("md-live edit host", () => {
  test("only document-edit tools mutate the buffer", async () => {
    const api = fakeApi();
    const read = await applyMdLiveAgentTool({
      api,
      tool: "md_live_get",
      args: {},
      filePath: "/tmp/a.md",
      clientId: "md-live:/tmp/a.md",
    });
    expect(read.success).toBe(true);
    expect(api.buffer).toBe("hello world");

    const denied = await applyMdLiveAgentTool({
      api,
      tool: "fs_write",
      args: { markdown: "nope" },
      filePath: "/tmp/a.md",
      clientId: "md-live:/tmp/a.md",
    });
    expect(denied.success).toBe(false);
    expect(denied.error_code).toBe("UNKNOWN_TOOL");
    expect(api.buffer).toBe("hello world");

    const edited = await applyMdLiveAgentTool({
      api,
      tool: "md_live_replace_selection",
      args: { markdown: "there" },
      filePath: "/tmp/a.md",
      clientId: "md-live:/tmp/a.md",
    });
    expect(edited.success).toBe(true);
    expect(api.buffer).toBe("there");
    unlockMdLiveStream("/tmp/a.md");
  });

  test("insert and replace_document stream through the host API", async () => {
    const api = fakeApi("alpha");
    const inserted = await applyMdLiveAgentTool({
      api,
      tool: "md_live_insert",
      args: { markdown: " beta" },
      filePath: "/tmp/a.md",
      clientId: "c",
    });
    expect(inserted.success).toBe(true);
    expect(api.buffer).toBe(" beta");

    const replaced = await applyMdLiveAgentTool({
      api,
      tool: "md_live_replace_document",
      args: { markdown: "# Title" },
      filePath: "/tmp/a.md",
      clientId: "c",
    });
    expect(replaced.success).toBe(true);
    expect(api.buffer).toBe("# Title");
    unlockMdLiveStream("/tmp/a.md");
  });

  test("mutating tools keep the stream lock until Accept or Reject", async () => {
    const path = `/tmp/lock-${Date.now()}.md`;
    const api = fakeApi("hello world");
    await applyMdLiveAgentTool({
      api,
      tool: "md_live_replace_selection",
      args: { markdown: "there" },
      filePath: path,
      clientId: "c",
    });
    expect(isMdLiveStreamLocked(path)).toBe(true);
    expect(finishMdLiveEditReview({ filePath: path, accept: true, api })).toBe(true);
    expect(api.accepted).toBe(true);
    expect(isMdLiveStreamLocked(path)).toBe(false);

    const rejected = fakeApi("hello world");
    await applyMdLiveAgentTool({
      api: rejected,
      tool: "md_live_replace_selection",
      args: { markdown: "nope" },
      filePath: path,
      clientId: "c",
    });
    let restored: string | null = null;
    finishMdLiveEditReview({
      filePath: path,
      accept: false,
      api: rejected,
      write: (content) => {
        restored = content;
      },
    });
    expect(restored).toBe("hello world");
    expect(isMdLiveStreamLocked(path)).toBe(false);
    unlockMdLiveStream(path);
  });
});
