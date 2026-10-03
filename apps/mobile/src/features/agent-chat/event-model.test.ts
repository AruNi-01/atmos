// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { AgentPart, AgentToolKind } from "@atmos/api-types/ws/dto/agent-chat";
import type { AgentToolCallPart } from "@atmos/agent-transcript";
import {
  activateFromSheet,
  activateWaitForBar,
  eventViewModel,
  furtherSheetTarget,
  initialExpandState,
  isWaitForOpen,
  openLeafSheet,
  transcriptEventModel,
} from "./event-model";

function tool(kind: AgentToolKind, extras: Partial<AgentToolCallPart> = {}): AgentPart {
  return {
    type: "tool_call",
    tool_call_id: kind,
    name: kind,
    status: "completed",
    kind,
    params: extras.params ?? { type: "other", value: null },
    ...extras,
  };
}

const parts: AgentPart[] = [
  tool("edit", {
    params: { type: "edit", path: "src/a.ts" },
    result: { type: "diff", path: "src/a.ts", old_content: "old", new_content: "new" },
  }),
  tool("edit", {
    tool_call_id: "patch",
    params: { type: "edit", path: "src/a.ts" },
    result: { type: "text", text: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n" },
  }),
  tool("edit", {
    tool_call_id: "stats",
    params: { type: "edit", path: "src/a.ts" },
    result: { type: "diff_stats", path: "src/a.ts", additions: 1, deletions: 1 },
  }),
  tool("read", {
    params: { type: "read", path: "src/a.ts" },
    result: { type: "file_content", path: "src/a.ts", text: "const n = 1;\n" },
  }),
  tool("search", {
    params: { type: "search", query: "n" },
    result: { type: "search_hits", query: "n", hits: [{ path: "src/a.ts", line: 1, snippet: "const n" }] },
  }),
  tool("web_search", {
    params: { type: "web_search", query: "atmos" },
    result: { type: "web_search", query: "atmos", links: [{ url: "https://example.com", title: "Example" }] },
  }),
  tool("fetch", {
    params: { type: "fetch", url: "https://example.com" },
    result: { type: "web_fetch", url: "https://example.com", markdown: "# Hi", text: "Hi" },
  }),
  tool("read", {
    tool_call_id: "images",
    params: { type: "read", path: "src/a.ts" },
    result: { type: "images", images: [{ path: "shot.png" }] },
  }),
  tool("other", {
    tool_call_id: "files",
    result: { type: "other", value: { kind: "files", paths: ["src/a.ts"] } },
  }),
  tool("other", {
    tool_call_id: "tree",
    result: {
      type: "other",
      value: { kind: "tree", entries: [{ name: "src", indent: 0, isDir: true, kind: "item" }] },
    },
  }),
  tool("other", {
    tool_call_id: "markdown",
    result: { type: "other", value: { kind: "markdown", markdown: "# Note" } },
  }),
  tool("other", {
    tool_call_id: "todos",
    result: { type: "other", value: { kind: "todos", todos: [{ content: "Ship", status: "pending" }] } },
  }),
  tool("other", {
    tool_call_id: "json",
    result: { type: "other", value: { type: "Bash", output: "ok" } },
  }),
  tool("skill", {
    params: { type: "skill", skill: "review" },
    result: { type: "text", text: "loaded" },
  }),
  tool("move", { params: { type: "move", from: "a.ts", to: "b.ts" } }),
  tool("delete", { params: { type: "delete", path: "gone.ts" } }),
  tool("read", {
    tool_call_id: "missing",
    params: { type: "read", path: "missing.ts" },
    result: { type: "error", message: "missing" },
  }),
  tool("mcp_list", { params: { type: "mcp_list", server: null }, result: { type: "empty" } }),
  tool("image_gen", {
    params: { type: "image_gen", prompt: "mark" },
    result: { type: "images", images: [{ path: "mark.png" }] },
  }),
  tool("plan_document", {
    params: {
      type: "plan_document",
      name: "Ship",
      plan: "## Work",
      todos: [{ content: "Map events", status: "pending" }],
    },
  }),
  tool("execute", {
    params: { type: "execute", command: "bun test", background: false },
    result: { type: "execute", output: "ok", exit_code: 0 },
  }),
  tool("subagent", {
    params: { type: "subagent", description: "Look" },
    result: { type: "text", text: "done" },
  }),
  { type: "text", text: "hello" },
  { type: "thinking", text: "hmm", duration_ms: 1500 },
  { type: "error", message: "boom" },
  { type: "session_lifecycle", action: "create", status: "completed" },
  { type: "session_config_change", model: { to: "gpt" } },
  { type: "session_hint", tone: "info", kind: "model_switch_failed" },
  {
    type: "permission",
    request: {
      request_id: "p1",
      tool: "Bash",
      description: "Run",
      status: "approved",
    },
  },
];

describe("mobile event view models", () => {
  test("each classified kind has its own non-empty view model", () => {
    const kinds = parts.map((part) => {
      const model = eventViewModel(part);
      expect(model.kind.length).toBeGreaterThan(0);
      expect(model.title.length).toBeGreaterThan(0);
      expect(model.blocks.length).toBeGreaterThan(0);
      expect(model.blocks.every((block) => block.text.trim().length > 0)).toBe(true);
      return model.kind;
    });
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toContain("diff");
    expect(kinds).toContain("image_gen");
    expect(kinds).toContain("plan_document");
    expect(kinds).toContain("execute");
    expect(kinds).toContain("subagent");
    expect(kinds).toContain("session_lifecycle");
    expect(kinds).toContain("session_config_change");
    expect(kinds).toContain("session_hint");
    expect(kinds).toContain("permission");
    expect(kinds).toContain("files");
    expect(kinds).toContain("tree");
    expect(kinds).toContain("markdown");
    expect(kinds).toContain("todos");
  });

  test("the wait-for bar starts collapsed and expands in place", () => {
    const initial = initialExpandState();
    expect(isWaitForOpen(initial, "m1")).toBe(false);
    const opened = activateWaitForBar(initial, "m1");
    expect(isWaitForOpen(opened, "m1")).toBe(true);
    expect(opened.sheets).toEqual(initial.sheets);
  });

  test("a failed session line keeps the error in the title and the body", () => {
    const model = eventViewModel({
      type: "session_lifecycle",
      action: "create",
      status: "failed",
      error: "disk full",
    });
    expect(model.sheet).toBeNull();
    expect(model.title).toContain("disk full");
    expect(model.blocks.some((block) => block.text.includes("disk full"))).toBe(true);
  });

  test("a text tour row opens one leaf sheet and that leaf has no further sheet", () => {
    const text = eventViewModel({ type: "text", text: "child said hello" });
    expect(text.sheet).toBeNull();
    const next = openLeafSheet(initialExpandState(), "tour-text", text);
    expect(next.sheets).toHaveLength(1);
    expect(next.sheets[0]?.model.blocks.some((block) => block.text.includes("child said hello"))).toBe(true);
    expect(furtherSheetTarget(next.sheets[0]!.model)).toBeNull();
    expect(openLeafSheet(next, "again", text).sheets).toHaveLength(1);
  });

  test("a tour event opens one leaf sheet and a sheet does not open another", () => {
    const initial = activateWaitForBar(initialExpandState(), "m1");
    const tour = eventViewModel(tool("read", {
      params: { type: "read", path: "src/a.ts" },
      result: { type: "file_content", path: "src/a.ts", text: "const n = 1;\n" },
    }));
    const next = openLeafSheet(initial, "read-1", tour);
    expect(next.sheets).toHaveLength(1);
    expect(furtherSheetTarget(next.sheets[0]!.model)).toBeNull();
    expect(isWaitForOpen(next, "m1")).toBe(true);
    expect(activateFromSheet(next, next.sheets[0]!.model)).toEqual(next);
    const second = openLeafSheet(next, "other", tour);
    expect(second.sheets).toHaveLength(1);
  });

  test("an other-tool sheet shows params and the result", () => {
    const model = eventViewModel(tool("other", {
      name: "VendorTool",
      title: "VendorTool",
      params: { type: "other", value: { type: "ReadFile", path: "/tmp/a.ts" } },
      result: { type: "other", value: { bytes: 12, ok: true } },
    }));
    const text = model.blocks.map((block) => block.text).join("\n");
    expect(text).toContain("ReadFile");
    expect(text).toContain("/tmp/a.ts");
    expect(text).toContain("\"bytes\": 12");
    const listed = eventViewModel(tool("other", {
      name: "Tool",
      title: "List apps, crates, packages layout",
      params: {
        type: "other",
        value: {
          command: "ls apps crates packages",
          description: "List apps, crates, packages layout",
        },
      },
      result: { type: "text", text: "apps\ncrates\n" },
    }));
    const listedText = listed.blocks.map((block) => block.text).join("\n");
    expect(listedText).toContain("ls apps crates packages");
    expect(listedText).toContain("apps\ncrates");
  });

  test("an empty image read sheet keeps the path and preview kind", () => {
    const model = eventViewModel(tool("read", {
      name: "Read",
      params: { type: "read", path: "shot.png" },
      result: { type: "file_content", path: "shot.png", text: "" },
    }));
    expect(model.kind).toBe("empty");
    expect(model.blocks.some((block) => block.text === "shot.png")).toBe(true);
    expect(model.blocks.some((block) => block.text === "Image")).toBe(true);
    expect(model.blocks.some((block) => block.text === "No output")).toBe(false);
  });

  test("a subagent sheet includes a child that arrived on another message and does not open another sheet", () => {
    const parent = tool("subagent", {
      tool_call_id: "parent",
      params: { type: "subagent", description: "Look" },
    });
    const child = tool("read", {
      tool_call_id: "child-read",
      parent_tool_call_id: "parent",
      params: { type: "read", path: "a.ts" },
      result: { type: "file_content", path: "a.ts", text: "export {}\n" },
    });
    const model = transcriptEventModel(parent, [], [
      { role: "assistant", parts: [parent] },
      { role: "assistant", parts: [child, { type: "text", text: "from the child", parent_tool_call_id: "parent" }] },
    ]);
    expect(model.sheet?.nested.map((row) => row.kind)).toEqual(["code", "text_part"]);
    expect(model.sheet?.nested.every((row) => row.sheet == null)).toBe(true);
    const opened = openLeafSheet(initialExpandState(), "parent", model);
    expect(opened.sheets).toHaveLength(1);
    expect(furtherSheetTarget(opened.sheets[0]!.model)).toBeNull();
    expect(opened.sheets[0]!.model.nested.some((row) => row.blocks.some((block) => block.text.includes("export {}")))).toBe(true);
  });
});
