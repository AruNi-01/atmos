// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { AgentToolCallPart } from "@atmos/agent-transcript";
import { importPure } from "./process-fold.test";

type Body = {
  kind: string;
  title?: string;
  status?: string;
  path?: string | null;
  text?: string;
  from?: string;
  to?: string;
  query?: string;
  markdown?: string;
  additions?: number;
  deletions?: number;
  paths?: string[];
  summary?: string;
  body?: string;
  url?: string;
  openable?: boolean;
  files?: Array<{
    path: string;
    additions: number;
    deletions: number;
    lines: Array<{ op: string; text: string }>;
  }>;
  links?: Array<{ title: string; url: string; openable: boolean }>;
  items?: Array<{ content?: string; status?: string } | { uri: string } | { path: string }>;
};

function call(part: AgentToolCallPart): Promise<Body> {
  return importPure("tool-body.tsx").then((mod) => {
    const model = mod.toolBodyModel as (value: AgentToolCallPart) => Body;
    return model(part);
  });
}

function part(
  overrides: Partial<AgentToolCallPart> & Pick<AgentToolCallPart, "kind" | "params">,
): AgentToolCallPart {
  return {
    type: "tool_call",
    tool_call_id: "tool-1",
    name: "Tool",
    status: "completed",
    ...overrides,
  };
}

describe("tool body presentation", () => {
  test("diff preview, stats, patch, and code come from the presentation", async () => {
    const diff = await call(
      part({
        name: "Edit",
        kind: "edit",
        params: { type: "edit", path: "a.ts" },
        result: { type: "diff", path: "a.ts", old_content: "a\nb\n", new_content: "a\nc\n" },
      }),
    );
    expect(diff.kind).toBe("diff");
    expect(diff.files?.[0]?.path).toBe("a.ts");
    expect(diff.files?.[0]?.additions).toBe(1);
    expect(diff.files?.[0]?.deletions).toBe(1);
    expect(diff.files?.[0]?.lines.map((line) => line.op)).toEqual(["ctx", "del", "add"]);

    const stats = await call(
      part({
        kind: "edit",
        params: { type: "edit", path: "a.ts" },
        result: { type: "diff_stats", path: "a.ts", additions: 2, deletions: 1 },
      }),
    );
    expect(stats).toMatchObject({ kind: "diff_stats", path: "a.ts", additions: 2, deletions: 1 });

    const patch = await call(
      part({
        kind: "edit",
        title: "Patch a.ts",
        params: { type: "edit", path: "a.ts" },
        result: { type: "text", text: "--- a/a.ts\n+++ b/a.ts\n" },
      }),
    );
    expect(patch.kind).toBe("patch");
    expect(patch.title).toBe("Patch a.ts");
    expect(patch.text).toContain("--- a/a.ts");

    const code = await call(
      part({
        kind: "read",
        params: { type: "read", path: "a.ts" },
        result: { type: "file_content", path: "a.ts", text: "const a = 1;\n" },
      }),
    );
    expect(code).toMatchObject({ kind: "code", path: "a.ts", text: "const a = 1;\n" });
  });

  test("search, fetch, files, tree, markdown, and todos stay on the presentation", async () => {
    const search = await call(
      part({
        kind: "web_search",
        params: { type: "web_search", query: "atmos" },
        result: {
          type: "web_search",
          query: "atmos",
          links: [
            { url: "https://atmos.dev", title: "Atmos" },
            { url: "javascript:alert(1)", title: "Blocked" },
          ],
        },
      }),
    );
    expect(search.kind).toBe("web_search");
    expect(search.query).toBe("atmos");
    expect(search.links?.[0]).toMatchObject({ title: "Atmos", openable: true });
    expect(search.links?.[1]).toMatchObject({ title: "Blocked", openable: false });

    const fetched = await call(
      part({
        kind: "fetch",
        params: { type: "fetch", url: "https://atmos.dev/docs" },
        result: {
          type: "web_fetch",
          url: "https://atmos.dev/docs",
          markdown: "# Docs",
          text: "plain",
        },
      }),
    );
    expect(fetched).toMatchObject({
      kind: "web_fetch",
      url: "https://atmos.dev/docs",
      openable: true,
      body: "# Docs",
    });

    const hits = await call(
      part({
        kind: "search",
        params: { type: "search", query: "fn main" },
        result: {
          type: "search_hits",
          query: "fn main",
          hits: [{ path: "src/main.rs", line: 4, snippet: "fn main" }],
        },
      }),
    );
    expect(hits).toMatchObject({ kind: "search", query: "fn main", paths: ["src/main.rs:4"] });

    const files = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
        result: { type: "other", value: { kind: "files", paths: ["a.ts", "b.ts"] } },
      }),
    );
    expect(files).toMatchObject({ kind: "files", paths: ["a.ts", "b.ts"] });

    const tree = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
        result: {
          type: "other",
          value: {
            kind: "tree",
            entries: [
              { name: "src", indent: 0, isDir: true, kind: "item" },
              { name: "a.ts", indent: 1, isDir: false, kind: "item" },
            ],
          },
        },
      }),
    );
    expect(tree).toMatchObject({ kind: "tree", paths: ["src", "src/a.ts"] });

    const markdown = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
        result: {
          type: "other",
          value: { kind: "markdown", markdown: "```mermaid\nA-->B\n```" },
        },
      }),
    );
    expect(markdown.kind).toBe("markdown");
    expect(markdown.markdown).toContain("```mermaid");

    const todos = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
        result: {
          type: "other",
          value: { kind: "todos", todos: [{ content: "Ship it", status: "in_progress" }] },
        },
      }),
    );
    expect(todos.kind).toBe("todos");
    expect(todos.items?.[0]).toMatchObject({ content: "Ship it", status: "In progress" });
  });

  test("mono, move, delete, error, empty, images, and subagent cards", async () => {
    const json = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
        result: { type: "other", value: { a: 1 } },
      }),
    );
    expect(json.kind).toBe("mono");
    expect(json.text).toContain('"a": 1');

    const text = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
        result: { type: "text", text: "hello" },
      }),
    );
    expect(text).toMatchObject({ kind: "mono", text: "hello" });

    const executed = await call(
      part({
        kind: "execute",
        params: { type: "execute", command: "pwd", background: false },
        result: { type: "execute", output: "ok" },
      }),
    );
    expect(executed).toMatchObject({ kind: "mono", text: "ok" });

    const moved = await call(
      part({
        kind: "move",
        params: { type: "move", from: "a.ts", to: "b.ts" },
      }),
    );
    expect(moved).toMatchObject({ kind: "move", from: "a.ts", to: "b.ts" });

    const deleted = await call(
      part({
        kind: "delete",
        params: { type: "delete", path: "gone.ts" },
      }),
    );
    expect(deleted).toMatchObject({ kind: "delete", path: "gone.ts" });

    const error = await call(
      part({
        kind: "read",
        params: { type: "read", path: "a.ts" },
        result: { type: "error", message: "missing" },
      }),
    );
    expect(error).toMatchObject({ kind: "error", text: "missing" });

    const emptyRead = await call(
      part({
        kind: "read",
        params: { type: "read", path: "a.ts" },
      }),
    );
    expect(emptyRead).toMatchObject({ kind: "empty", path: "a.ts" });

    const emptyOther = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
      }),
    );
    expect(emptyOther).toMatchObject({ kind: "empty", path: null });

    const images = await call(
      part({
        kind: "image_gen",
        params: { type: "image_gen", prompt: "cat" },
        result: {
          type: "images",
          images: [{ url: "https://example.com/cat.png" }, { path: "cat.png" }],
        },
      }),
    );
    expect(images.kind).toBe("images");
    expect(images.items).toEqual([{ uri: "https://example.com/cat.png" }, { path: "cat.png" }]);

    const imageGenEmpty = await call(
      part({
        kind: "image_gen",
        params: { type: "image_gen", prompt: "cat", path: "out.png" },
      }),
    );
    expect(imageGenEmpty).toMatchObject({ kind: "empty", path: null });

    const plan = await call(
      part({
        kind: "plan_document",
        params: { type: "plan_document", plan: "# Plan", todos: [] },
      }),
    );
    expect(plan).toMatchObject({ kind: "empty", path: null });

    const subagent = await call(
      part({
        name: "Task",
        title: "Scout",
        kind: "subagent",
        status: "running",
        params: { type: "subagent", description: "look around" },
      }),
    );
    expect(subagent).toMatchObject({ kind: "subagent", title: "Scout", status: "Running" });
  });

  test("nested children are timeline-hidden, and long mono text caps at 12 lines", async () => {
    const mod = await importPure("tool-body.tsx");
    const show = mod.showToolRow as (
      part: AgentToolCallPart,
      surface: "timeline" | "wait",
    ) => boolean;
    const cap = mod.cappedToolText as (
      text: string,
      expanded: boolean,
    ) => { text: string; overflow: boolean };
    const nested = part({
      kind: "read",
      parent_tool_call_id: "parent",
      params: { type: "read", path: "a.ts" },
    });
    expect(show(nested, "timeline")).toBe(false);
    expect(show(nested, "wait")).toBe(true);
    const lines = Array.from({ length: 13 }, (_, index) => `line ${index + 1}`).join("\n");
    const collapsed = cap(lines, false);
    expect(collapsed.overflow).toBe(true);
    expect(collapsed.text.split("\n")).toHaveLength(12);
    expect(cap(lines, true).text.split("\n")).toHaveLength(13);
  });
});
