import { describe, expect, it } from "bun:test";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import {
  displayToolPath,
  displayToolTitle,
  languageFromPath,
  pathRelativeToCwd,
  presentAgentTool,
  prettyJson,
  relativeDisplayPath,
  resolveAgentToolCardHeading,
  resolveTreeEntryPaths,
  stripReadLineNumbers,
  toolTitleLooksLikePath,
} from "../parse-tool-result";

function tool(
  overrides: Partial<AgentToolCallPart> & Pick<AgentToolCallPart, "kind" | "params">,
): AgentToolCallPart {
  return {
    type: "tool_call",
    tool_call_id: overrides.tool_call_id ?? "t1",
    name: overrides.name ?? overrides.kind,
    status: overrides.status ?? "completed",
    ...overrides,
  };
}

describe("languageFromPath", () => {
  it("maps common extensions", () => {
    expect(languageFromPath("src/foo.tsx")).toBe("tsx");
    expect(languageFromPath("crates/agent/src/lib.rs")).toBe("rust");
    expect(languageFromPath("README.md")).toBe("markdown");
    expect(languageFromPath("Dockerfile")).toBe("dockerfile");
  });

  it("falls back to plaintext", () => {
    expect(languageFromPath(null)).toBe("plaintext");
    expect(languageFromPath("LICENSE")).toBe("plaintext");
  });
});

describe("stripReadLineNumbers", () => {
  it("strips Claude-style numbered Read output", () => {
    const raw = [
      "     1|use std::path::Path;",
      "     2|",
      "     3|pub fn main() {}",
    ].join("\n");
    expect(stripReadLineNumbers(raw)).toBe("use std::path::Path;\n\npub fn main() {}");
  });

  it("leaves ordinary file content alone", () => {
    const raw = "fn main() {\n  println!(\"hi\");\n}";
    expect(stripReadLineNumbers(raw)).toBe(raw);
  });

  it("does not strip Go map keys that use N:", () => {
    const raw = [
      "var m = map[int]string{",
      "  1: \"alpha\",",
      "  2: \"beta\",",
      "  3: \"gamma\",",
      "}",
    ].join("\n");
    expect(stripReadLineNumbers(raw)).toBe(raw);
  });

  it("strips sparse numbered arrows", () => {
    const raw = [
      "1→# Title",
      "",
      "body",
      "10→next section",
    ].join("\n");
    expect(stripReadLineNumbers(raw)).toBe("# Title\n\nbody\nnext section");
  });
});

describe("relativeDisplayPath", () => {
  it("strips the shared directory prefix from grep hits", () => {
    const paths = [
      "/tmp/app/specs/README.md",
      "/tmp/app/e2e/README.md",
      "/tmp/app/README.md",
    ];
    expect(relativeDisplayPath(paths[0]!, paths)).toBe("specs/README.md");
    expect(relativeDisplayPath(paths[1]!, paths)).toBe("e2e/README.md");
    expect(relativeDisplayPath(paths[2]!, paths)).toBe("README.md");
  });
});

describe("pathRelativeToCwd", () => {
  const cwd = "/Users/aarynlu/OpenSource/atmos";

  it("strips the session cwd prefix", () => {
    expect(pathRelativeToCwd(`${cwd}/apps/web/src/foo.ts`, cwd)).toBe("apps/web/src/foo.ts");
  });

  it("returns . for the cwd itself", () => {
    expect(pathRelativeToCwd(cwd, cwd)).toBe(".");
  });

  it("leaves paths outside the cwd alone", () => {
    expect(pathRelativeToCwd("/tmp/app/README.md", cwd)).toBe("/tmp/app/README.md");
  });

  it("unwraps file URIs", () => {
    expect(displayToolPath(`file://${cwd}/README.md`, cwd)).toBe("README.md");
  });
});

describe("displayToolTitle", () => {
  const cwd = "/Users/aarynlu/OpenSource/atmos";

  it("rewrites an absolute path in a ReadFile title", () => {
    expect(displayToolTitle(
      `ReadFile: ${cwd}/apps/web/src/features/agent/lib/foo.ts`,
      cwd,
      `${cwd}/apps/web/src/features/agent/lib/foo.ts`,
    )).toBe("ReadFile: apps/web/src/features/agent/lib/foo.ts");
  });
});

describe("resolveTreeEntryPaths", () => {
  it("joins nested tree names", () => {
    expect(resolveTreeEntryPaths([
      { name: "src", indent: 0, isDir: true, kind: "item" },
      { name: "a.ts", indent: 1, isDir: false, kind: "item" },
    ])).toEqual(["src", "src/a.ts"]);
  });
});

describe("S16 presentAgentTool", () => {
  it("renders web_search links from the Atmos result", () => {
    const parsed = presentAgentTool(tool({
      kind: "web_search",
      name: "WebSearch",
      params: { type: "web_search", query: "atmos agent chat" },
      result: {
        type: "web_search",
        query: "atmos agent chat",
        links: [
          { url: "https://example.com/a", title: "A", snippet: "alpha" },
          { url: "https://example.com/b", title: "B" },
        ],
      },
    }));
    expect(parsed.presentation).toEqual({
      kind: "web_search",
      query: "atmos agent chat",
      links: [
        { url: "https://example.com/a", title: "A", snippet: "alpha" },
        { url: "https://example.com/b", title: "B", snippet: undefined },
      ],
    });
  });

  it("renders fetch url and body from the Atmos result", () => {
    const parsed = presentAgentTool(tool({
      kind: "fetch",
      name: "WebFetch",
      params: { type: "fetch", url: "https://example.com/page" },
      result: {
        type: "web_fetch",
        url: "https://example.com/page",
        title: "Example",
        markdown: "# Hello",
        text: "Hello",
      },
    }));
    expect(parsed.presentation).toEqual({
      kind: "web_fetch",
      url: "https://example.com/page",
      title: "Example",
      markdown: "# Hello",
      text: "Hello",
    });
  });

  it("APP-069 S2 keeps workspace search as text when the result is Text", () => {
    const parsed = presentAgentTool(tool({
      kind: "search",
      name: "Grep",
      params: { type: "search", query: "AgentTool", glob: "*.ts" },
      result: { type: "text", text: "apps/web/src/foo.ts:8:export function AgentTool() {}" },
    }));
    expect(parsed.presentation).toEqual({
      kind: "text",
      text: "apps/web/src/foo.ts:8:export function AgentTool() {}",
    });
  });

  it("APP-069 S1 renders search_hits as a search body", () => {
    const parsed = presentAgentTool(tool({
      kind: "search",
      name: "Grep",
      params: { type: "search", query: "AgentTool", glob: "*.ts" },
      result: {
        type: "search_hits",
        query: "AgentTool",
        hits: [
          { path: "apps/web/src/foo.ts", line: 8, snippet: "export function AgentTool() {}" },
          { path: "apps/web/src/bar.ts", line: null, snippet: null },
        ],
      },
    }));
    expect(parsed.presentation).toEqual({
      kind: "search",
      hits: [
        { path: "apps/web/src/foo.ts", line: 8, text: "export function AgentTool() {}" },
        { path: "apps/web/src/bar.ts", text: "" },
      ],
    });
  });

  it("APP-069 S2 does not treat web_search as search_hits", () => {
    const parsed = presentAgentTool(tool({
      kind: "web_search",
      name: "WebSearch",
      params: { type: "web_search", query: "atmos agent chat" },
      result: {
        type: "web_search",
        query: "atmos agent chat",
        links: [{ url: "https://example.com/a", title: "A", snippet: "alpha" }],
      },
    }));
    expect(parsed.presentation.kind).toBe("web_search");
    expect(parsed.presentation).not.toMatchObject({ kind: "search" });
  });

  it("renders read file content as code", () => {
    const parsed = presentAgentTool(tool({
      kind: "read",
      name: "Read",
      params: { type: "read", path: "src/lib.rs", offset: 1, limit: 40 },
      result: { type: "file_content", path: "src/lib.rs", text: "     1|pub fn main() {}\n" },
    }));
    expect(parsed.presentation).toEqual({
      kind: "code",
      path: "src/lib.rs",
      language: "rust",
      code: "pub fn main() {}\n",
    });
    expect(parsed.lineRange).toEqual({ start: 1, end: 40 });
  });

  it("renders markdown file reads as code, not markdown preview", () => {
    const parsed = presentAgentTool(tool({
      kind: "read",
      name: "Read",
      params: { type: "read", path: "/tmp/plan.md" },
      result: {
        type: "file_content",
        path: "/tmp/plan.md",
        text: "     1|# Plan\n     2|\n     3|- step\n",
      },
    }));
    expect(parsed.presentation).toEqual({
      kind: "code",
      path: "/tmp/plan.md",
      language: "markdown",
      code: "# Plan\n\n- step\n",
    });
    expect(parsed.presentation.kind).not.toBe("markdown");
  });

  it("keeps markdown write/edit patches as diff presentation", () => {
    const patch = "--- a/plan.md\n+++ b/plan.md\n@@ -1,1 +1,2 @@\n-# Plan\n+# Plan\n+- step\n";
    const parsed = presentAgentTool(tool({
      kind: "edit",
      name: "Write",
      params: { type: "edit", path: "/tmp/plan.md" },
      result: { type: "text", text: patch },
    }));
    expect(parsed.presentation).toEqual({
      kind: "patch",
      path: "/tmp/plan.md",
      patch,
    });
  });

  it("maps write/edit diff_stats to a stats presentation (no path preview)", () => {
    const parsed = presentAgentTool(tool({
      kind: "edit",
      name: "Write",
      params: { type: "edit", path: "/tmp/plan.md" },
      result: { type: "diff_stats", path: "/tmp/plan.md", additions: 12, deletions: 0 },
    }));
    expect(parsed.presentation).toEqual({
      kind: "diff_stats",
      path: "/tmp/plan.md",
      additions: 12,
      deletions: 0,
    });
    expect(parsed.path).toBe("/tmp/plan.md");
  });

  it("maps edit diff results to the multi-file diff presentation", () => {
    const parsed = presentAgentTool(tool({
      kind: "edit",
      name: "Edit",
      params: { type: "edit", path: "src/a.ts" },
      result: {
        type: "diff",
        path: "src/a.ts",
        old_content: "old\n",
        new_content: "new\n",
      },
    }));
    expect(parsed.presentation).toEqual({
      kind: "diff",
      files: [{
        path: "src/a.ts",
        oldContent: "old\n",
        newContent: "new\n",
      }],
    });
  });

  it("keeps outside-workspace plan.md Diff contents (no path-preview demotion)", () => {
    const path = "/Users/me/.cursor/plans/Agent-Chat.plan.md";
    const parsed = presentAgentTool(tool({
      kind: "edit",
      name: "Edit",
      params: { type: "edit", path },
      result: {
        type: "diff",
        path,
        old_content: "# Plan\n- a\n",
        new_content: "# Plan\n- b\n",
      },
    }));
    expect(parsed.presentation).toEqual({
      kind: "diff",
      files: [{
        path,
        oldContent: "# Plan\n- a\n",
        newContent: "# Plan\n- b\n",
      }],
    });
    expect(parsed.presentation.kind).not.toBe("diff_stats");
  });

  it("renders edit patch text as a patch", () => {
    const patch = "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n";
    const parsed = presentAgentTool(tool({
      kind: "edit",
      name: "Edit",
      params: { type: "edit", path: "src/a.ts" },
      result: { type: "text", text: patch },
    }));
    expect(parsed.presentation).toEqual({
      kind: "patch",
      path: "src/a.ts",
      patch,
    });
  });

  it("does not unwrap vendor envelopes to pick a kind", () => {
    const parsed = presentAgentTool(tool({
      kind: "other",
      name: "Tool",
      params: { type: "other", value: { type: "ReadFile", FileContent: { absolute_path: "/tmp/a.ts" } } },
      result: { type: "other", value: { type: "Bash", output: "ok" } },
    }));
    expect(parsed.presentation).toEqual({
      kind: "json",
      json: prettyJson({ type: "Bash", output: "ok" }),
    });
    expect(JSON.stringify(parsed)).not.toContain("native");
  });

  it("maps an Atmos error result to an error body", () => {
    const parsed = presentAgentTool(tool({
      kind: "read",
      name: "Read",
      params: { type: "read", path: "missing.ts" },
      result: { type: "error", message: "File not found" },
    }));
    expect(parsed.presentation).toEqual({ kind: "error", text: "File not found" });
  });

  it("renders move and delete from params", () => {
    expect(presentAgentTool(tool({
      kind: "move",
      params: { type: "move", from: "src/a.ts", to: "src/b.ts" },
    })).presentation).toEqual({ kind: "move", from: "src/a.ts", to: "src/b.ts" });
    expect(presentAgentTool(tool({
      kind: "delete",
      params: { type: "delete", path: "src/gone.ts" },
    })).presentation).toEqual({ kind: "delete", path: "src/gone.ts" });
  });
});

describe("tool title path detection", () => {
  it("treats Tool: abs path and bare paths as the file", () => {
    const path = "/Users/me/app/Cargo.toml";
    expect(toolTitleLooksLikePath(path, path)).toBe(true);
    expect(toolTitleLooksLikePath(`Tool: ${path}`, path)).toBe(true);
    expect(toolTitleLooksLikePath("List apps, crates, packages layout", path)).toBe(false);
  });
});

describe("resolveAgentToolCardHeading", () => {
  const formatWithPath = (tool: string, path: string) => `${tool}: ${path}`;

  it("falls back to kind verb + path when the title is path-only or generic", () => {
    expect(resolveAgentToolCardHeading({
      heading: "/tmp/app/AGENTS.md",
      path: "/tmp/app/AGENTS.md",
      kindLabel: "Read",
      formatWithPath,
    })).toBe("Read: /tmp/app/AGENTS.md");
    expect(resolveAgentToolCardHeading({
      heading: "Read",
      path: "lib.rs",
      kindLabel: "Read",
      formatWithPath,
    })).toBe("Read: lib.rs");
    expect(resolveAgentToolCardHeading({
      heading: "",
      path: null,
      kindLabel: "Read",
      formatWithPath,
    })).toBe("Read");
  });

  it("keeps rich titles that already include the action when no chip omits the path", () => {
    expect(resolveAgentToolCardHeading({
      heading: "Write '/tmp/plan.md'",
      path: "/tmp/plan.md",
      kindLabel: "Edit",
      formatWithPath,
    })).toBe("Write '/tmp/plan.md'");
    expect(resolveAgentToolCardHeading({
      heading: "Read 'specs/TECH.md'",
      path: "specs/TECH.md",
      kindLabel: "Read",
      formatWithPath,
    })).toBe("Read 'specs/TECH.md'");
  });

  it("omits path echo from the title when a file chip shows the path", () => {
    expect(resolveAgentToolCardHeading({
      heading: "Read 'specs/APP/QUALITY-001_agent_crate_architecture_refactor/TECH.md'",
      path: "specs/APP/QUALITY-001_agent_crate_architecture_refactor/TECH.md",
      kindLabel: "Read",
      formatWithPath,
      omitPathInTitle: true,
    })).toBe("Read");
    expect(resolveAgentToolCardHeading({
      heading: "Write '/tmp/plan.md'",
      path: "/tmp/plan.md",
      kindLabel: "Edit",
      formatWithPath,
      omitPathInTitle: true,
    })).toBe("Write");
    expect(resolveAgentToolCardHeading({
      heading: "Read",
      path: "lib.rs",
      kindLabel: "Read",
      formatWithPath,
      omitPathInTitle: true,
    })).toBe("Read");
    expect(resolveAgentToolCardHeading({
      heading: "/tmp/app/AGENTS.md",
      path: "/tmp/app/AGENTS.md",
      kindLabel: "Read",
      formatWithPath,
      omitPathInTitle: true,
    })).toBe("Read");
    expect(resolveAgentToolCardHeading({
      heading: "ReadFile: /Users/me/app/src/foo.ts",
      path: "/Users/me/app/src/foo.ts",
      kindLabel: "Read",
      formatWithPath,
      omitPathInTitle: true,
      pathAliases: ["src/foo.ts"],
    })).toBe("ReadFile");
  });
});
