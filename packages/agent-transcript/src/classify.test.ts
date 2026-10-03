import { describe, expect, it } from "bun:test";
import type { AgentPart, AgentToolKind } from "@atmos/api-types/ws/dto/agent-chat";
import {
  classifyTranscriptPart,
  presentAgentTool,
  subagentChildParts,
  waitForSection,
  type AgentToolCallPart,
  type TranscriptDetail,
} from "./index";

function tool(
  kind: AgentToolKind,
  extras: Partial<AgentToolCallPart> = {},
): AgentToolCallPart {
  const params = extras.params ?? defaultParams(kind);
  return {
    type: "tool_call",
    tool_call_id: extras.tool_call_id ?? kind,
    name: extras.name ?? kind,
    status: extras.status ?? "completed",
    kind,
    ...extras,
    params,
  };
}

function defaultParams(kind: AgentToolKind): AgentToolCallPart["params"] {
  switch (kind) {
    case "read":
      return { type: "read", path: "src/a.ts" };
    case "edit":
      return { type: "edit", path: "src/a.ts" };
    case "delete":
      return { type: "delete", path: "src/gone.ts" };
    case "move":
      return { type: "move", from: "src/a.ts", to: "src/b.ts" };
    case "search":
      return { type: "search", query: "AgentTool", glob: "*.ts" };
    case "web_search":
      return { type: "web_search", query: "atmos" };
    case "execute":
      return { type: "execute", command: "bun test", background: false };
    case "fetch":
      return { type: "fetch", url: "https://example.com/page" };
    case "skill":
      return { type: "skill", skill: "review" };
    case "subagent":
      return { type: "subagent", description: "Inspect the diff", agent_type: "explore", prompt: "Look around" };
    case "mcp_list":
      return { type: "mcp_list", server: null };
    case "mcp_call":
      return { type: "mcp_call", server: null, tool: null };
    case "image_gen":
      return { type: "image_gen", prompt: "a glass mark", aspect_ratio: "1:1", path: "mark.png" };
    case "plan_document":
      return {
        type: "plan_document",
        name: "Ship it",
        overview: "Three steps",
        plan: "## Do the work",
        todos: [{ content: "Write the mapping", status: "pending" }],
      };
    case "other":
      return { type: "other", value: null };
  }
}

function detailKind(part: AgentPart): TranscriptDetail["kind"] {
  return classifyTranscriptPart(part).detail.kind;
}

describe("classifyTranscriptPart", () => {
  it("classifies every presentation kind and the non-tool parts web renders", () => {
    const cases: Array<{ part: AgentPart; visibility: string; kind: string; detail: TranscriptDetail["kind"] }> = [
      {
        part: tool("edit", {
          result: {
            type: "diff",
            path: "src/a.ts",
            old_content: "old",
            new_content: "new",
          },
        }),
        visibility: "visible",
        kind: "edit",
        detail: "diff",
      },
      {
        part: tool("edit", {
          result: { type: "text", text: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n" },
        }),
        visibility: "visible",
        kind: "edit",
        detail: "patch",
      },
      {
        part: tool("edit", {
          result: { type: "diff_stats", path: "src/a.ts", additions: 2, deletions: 1 },
        }),
        visibility: "visible",
        kind: "edit",
        detail: "diff_stats",
      },
      {
        part: tool("read", {
          result: { type: "file_content", path: "src/a.ts", text: "export const n = 1;\n" },
        }),
        visibility: "visible",
        kind: "read",
        detail: "code",
      },
      {
        part: tool("search", {
          result: {
            type: "search_hits",
            query: "AgentTool",
            hits: [{ path: "src/a.ts", line: 4, snippet: "AgentTool" }],
          },
        }),
        visibility: "visible",
        kind: "search",
        detail: "search",
      },
      {
        part: tool("web_search", {
          result: {
            type: "web_search",
            query: "atmos",
            links: [{ url: "https://example.com", title: "Example", snippet: "hi" }],
          },
        }),
        visibility: "visible",
        kind: "web_search",
        detail: "web_search",
      },
      {
        part: tool("fetch", {
          result: {
            type: "web_fetch",
            url: "https://example.com/page",
            title: "Example",
            markdown: "# Hello",
            text: "Hello",
          },
        }),
        visibility: "visible",
        kind: "fetch",
        detail: "web_fetch",
      },
      {
        part: tool("read", {
          result: { type: "images", images: [{ path: "shot.png", mime: "image/png" }] },
        }),
        visibility: "visible",
        kind: "read",
        detail: "images",
      },
      {
        part: tool("other", {
          result: { type: "other", value: { kind: "files", paths: ["src/a.ts", "src/b.ts"] } },
        }),
        visibility: "visible",
        kind: "other",
        detail: "files",
      },
      {
        part: tool("other", {
          result: {
            type: "other",
            value: {
              kind: "tree",
              entries: [{ name: "src", indent: 0, isDir: true, kind: "item" }],
            },
          },
        }),
        visibility: "visible",
        kind: "other",
        detail: "tree",
      },
      {
        part: tool("other", {
          result: { type: "other", value: { kind: "markdown", markdown: "# Plan" } },
        }),
        visibility: "visible",
        kind: "other",
        detail: "markdown",
      },
      {
        part: tool("other", {
          result: {
            type: "other",
            value: { kind: "todos", todos: [{ content: "Ship", status: "pending" }] },
          },
        }),
        visibility: "visible",
        kind: "other",
        detail: "todos",
      },
      {
        part: tool("other", {
          result: { type: "other", value: { type: "Bash", output: "ok" } },
        }),
        visibility: "visible",
        kind: "other",
        detail: "json",
      },
      {
        part: tool("skill", { result: { type: "text", text: "loaded review" } }),
        visibility: "visible",
        kind: "skill",
        detail: "text",
      },
      {
        part: tool("move"),
        visibility: "visible",
        kind: "move",
        detail: "move",
      },
      {
        part: tool("delete"),
        visibility: "visible",
        kind: "delete",
        detail: "delete",
      },
      {
        part: tool("read", { result: { type: "error", message: "File not found" } }),
        visibility: "visible",
        kind: "read",
        detail: "error",
      },
      {
        part: tool("mcp_list", { result: { type: "empty" } }),
        visibility: "visible",
        kind: "mcp_list",
        detail: "empty",
      },
      {
        part: tool("image_gen", {
          result: { type: "images", images: [{ path: "mark.png" }] },
        }),
        visibility: "visible",
        kind: "image_gen",
        detail: "image_gen",
      },
      {
        part: tool("plan_document"),
        visibility: "visible",
        kind: "plan_document",
        detail: "plan_document",
      },
      {
        part: tool("execute", {
          result: { type: "execute", output: "ok", exit_code: 0 },
        }),
        visibility: "visible",
        kind: "execute",
        detail: "execute",
      },
      {
        part: tool("subagent", { result: { type: "text", text: "child finished" } }),
        visibility: "visible",
        kind: "subagent",
        detail: "subagent",
      },
      {
        part: { type: "text", text: "hello" },
        visibility: "visible",
        kind: "text",
        detail: "text_part",
      },
      {
        part: { type: "thinking", text: "hmm", duration_ms: 1200 },
        visibility: "visible",
        kind: "thinking",
        detail: "thinking",
      },
      {
        part: { type: "error", message: "boom" },
        visibility: "visible",
        kind: "error",
        detail: "error_part",
      },
      {
        part: { type: "session_lifecycle", action: "create", status: "completed", duration_ms: 2000 },
        visibility: "visible",
        kind: "session_lifecycle",
        detail: "session_lifecycle",
      },
      {
        part: { type: "session_config_change", model: { from: "a", to: "b" } },
        visibility: "visible",
        kind: "session_config_change",
        detail: "session_config_change",
      },
      {
        part: { type: "session_hint", tone: "warning", kind: "model_switch_failed" },
        visibility: "visible",
        kind: "session_hint",
        detail: "session_hint",
      },
      {
        part: {
          type: "permission",
          request: {
            request_id: "p1",
            tool: "Bash",
            description: "Run tests",
            status: "approved",
            options: [{ option_id: "allow", name: "Allow", kind: "allow" }],
          },
        },
        visibility: "visible",
        kind: "permission",
        detail: "permission",
      },
    ];

    const seen = new Set<string>();
    for (const item of cases) {
      const classified = classifyTranscriptPart(item.part);
      expect(classified.visibility).toBe(item.visibility);
      expect(classified.kind).toBe(item.kind);
      expect(classified.detail.kind).toBe(item.detail);
      seen.add(classified.detail.kind);
    }

    const required = [
      "diff",
      "patch",
      "diff_stats",
      "code",
      "search",
      "web_search",
      "web_fetch",
      "images",
      "files",
      "tree",
      "markdown",
      "todos",
      "json",
      "text",
      "move",
      "delete",
      "error",
      "empty",
      "image_gen",
      "plan_document",
      "execute",
      "subagent",
      "text_part",
      "thinking",
      "error_part",
      "session_lifecycle",
      "session_config_change",
      "session_hint",
      "permission",
    ];
    for (const kind of required) expect(seen.has(kind)).toBe(true);

    const diff = classifyTranscriptPart(cases[0]!.part);
    if (diff.detail.kind === "diff") {
      expect(diff.detail.files[0]).toEqual({ path: "src/a.ts", oldContent: "old", newContent: "new" });
    }
    const execute = classifyTranscriptPart(tool("execute", {
      result: { type: "execute", output: "ok", exit_code: 0 },
    }));
    if (execute.detail.kind === "execute") {
      expect(execute.detail.output).toBe("ok");
      expect(execute.detail.command).toBe("bun test");
      expect(execute.detail.exitCode).toBe(0);
    }
    const image = classifyTranscriptPart(tool("image_gen", {
      result: { type: "images", images: [{ path: "mark.png" }] },
    }));
    if (image.detail.kind === "image_gen") {
      expect(image.detail.prompt).toBe("a glass mark");
      expect(image.detail.images[0]?.path).toBe("mark.png");
    }
    const plan = classifyTranscriptPart(tool("plan_document"));
    if (plan.detail.kind === "plan_document") {
      expect(plan.detail.plan).toBe("## Do the work");
      expect(plan.detail.todos[0]?.content).toBe("Write the mapping");
    }
    const child = classifyTranscriptPart(tool("subagent", { result: { type: "text", text: "child finished" } }));
    if (child.detail.kind === "subagent") {
      expect(child.detail.description).toBe("Inspect the diff");
      expect(child.detail.resultText).toBe("child finished");
      expect(child.detail.prompt).toBe("Look around");
    }
    const created = classifyTranscriptPart(cases.find((item) => item.detail === "session_lifecycle")!.part);
    if (created.detail.kind === "session_lifecycle") expect(created.detail.label).toBe("Created session in 2s");
    const hint = classifyTranscriptPart(cases.find((item) => item.detail === "session_hint")!.part);
    if (hint.detail.kind === "session_hint") expect(hint.detail.label).toBe("Couldn't switch model in this session");
    const permission = classifyTranscriptPart(cases.find((item) => item.detail === "permission")!.part);
    if (permission.detail.kind === "permission") {
      expect(permission.detail.tool).toBe("Bash");
      expect(permission.detail.shownInTranscript).toBe(true);
      expect(permission.detail.options[0]?.name).toBe("Allow");
    }
  });

  it("hides composer chrome, nested children, and subagent-wait polls", () => {
    expect(classifyTranscriptPart({ type: "plan", plan: { steps: [] } }).visibility).toBe("hidden_chrome");
    expect(classifyTranscriptPart({ type: "attachment", path: "a.png" }).visibility).toBe("hidden_chrome");
    expect(classifyTranscriptPart(tool("other", { name: "enter_plan", title: "Enter plan" })).visibility).toBe("hidden_chrome");
    expect(classifyTranscriptPart({
      type: "session_config_change",
      mode: { to: "plan" },
    }).visibility).toBe("hidden_chrome");
    expect(classifyTranscriptPart({
      type: "text",
      text: "nested",
      parent_tool_call_id: "parent",
    }).visibility).toBe("nested_child");
    const wait = classifyTranscriptPart(tool("other", {
      name: "get_command_or_subagent_output",
      title: "TaskOutput",
    }));
    expect(wait.visibility).toBe("subagent_wait");
    expect(presentAgentTool(tool("other", {
      result: { type: "other", value: { type: "Bash", output: "ok" } },
    })).presentation.kind).toBe("json");
  });

  it("groups wait polls and keeps their nested events as tour rows", () => {
    const wait = tool("other", {
      tool_call_id: "wait-1",
      name: "TaskOutput",
      title: "TaskOutput",
    });
    const nested = tool("read", {
      tool_call_id: "read-1",
      parent_tool_call_id: "wait-1",
      result: { type: "file_content", path: "src/a.ts", text: "const n = 1;\n" },
    });
    const section = waitForSection([
      { type: "text", text: "hello" },
      wait,
      nested,
    ]);
    expect(section?.anchors.map((row) => row.part.tool_call_id)).toEqual(["wait-1"]);
    expect(section?.rows.map((row) => row.part.type === "tool_call" ? row.part.tool_call_id : row.part.type)).toEqual(["read-1"]);
    expect(detailKind(nested)).toBe("code");
  });

  it("keeps other-tool params beside the result", () => {
    const vendor = classifyTranscriptPart(tool("other", {
      name: "VendorTool",
      title: "VendorTool",
      params: { type: "other", value: { type: "ReadFile", path: "/tmp/a.ts" } },
      result: { type: "other", value: { bytes: 12, ok: true } },
    }));
    expect(vendor.detail.kind).toBe("json");
    expect(vendor.detail.paramsJson).toContain("ReadFile");
    expect(vendor.detail.paramsJson).toContain("/tmp/a.ts");
    if (vendor.detail.kind === "json") expect(vendor.detail.json).toContain("\"bytes\": 12");

    const listed = classifyTranscriptPart(tool("other", {
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
    expect(listed.detail.paramsJson).toContain("ls apps crates packages");
    expect(listed.detail.paramsJson).not.toContain("List apps, crates, packages layout");
    expect(listed.detail.kind).toBe("text");
    if (listed.detail.kind === "text") expect(listed.detail.text).toBe("apps\ncrates\n");
  });

  it("keeps the path and image-or-text preview for an empty read", () => {
    const image = classifyTranscriptPart(tool("read", {
      name: "Read",
      params: { type: "read", path: "shot.png" },
      result: { type: "file_content", path: "shot.png", text: "" },
    }));
    expect(image.detail.kind).toBe("empty");
    if (image.detail.kind === "empty") {
      expect(image.detail.path).toBe("shot.png");
      expect(image.detail.preview).toBe("image");
    }
    const note = classifyTranscriptPart(tool("read", {
      name: "Read",
      params: { type: "read", path: "/tmp/note.md" },
      result: { type: "text", text: "   " },
    }));
    expect(note.detail.kind).toBe("empty");
    if (note.detail.kind === "empty") {
      expect(note.detail.path).toBe("/tmp/note.md");
      expect(note.detail.preview).toBe("text");
    }
  });

  it("collects subagent children that arrived on another message", () => {
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
    const wait = tool("other", {
      tool_call_id: "wait",
      name: "TaskOutput",
      title: "TaskOutput",
      parent_tool_call_id: "parent",
    });
    const rows = subagentChildParts(
      [
        { role: "assistant", parts: [parent] },
        { role: "user", parts: [{ type: "text", text: "next" }] },
        {
          role: "assistant",
          parts: [
            child,
            wait,
            { type: "text", text: "nested hello", parent_tool_call_id: "parent" },
            { type: "text", text: "not a child" },
          ],
        },
      ],
      "parent",
    );
    expect(rows.map((part) => part.type === "tool_call" ? part.tool_call_id : part.type === "text" ? part.text : part.type)).toEqual([
      "child-read",
      "nested hello",
    ]);
  });
});
