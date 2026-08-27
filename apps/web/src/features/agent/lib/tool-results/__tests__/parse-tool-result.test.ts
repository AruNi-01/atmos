import { describe, expect, it } from "bun:test";
import {
  languageFromPath,
  parseSearchOutput,
  parseToolResult,
  stripReadLineNumbers,
} from "../parse-tool-result";

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
});

describe("parseSearchOutput", () => {
  it("parses grep hits", () => {
    const parsed = parseSearchOutput([
      "apps/web/src/foo.ts:12:  const x = 1",
      "apps/web/src/bar.ts:40:  const x = 2",
    ].join("\n"));
    expect(parsed).toEqual({
      hits: [
        { path: "apps/web/src/foo.ts", line: 12, text: "const x = 1" },
        { path: "apps/web/src/bar.ts", line: 40, text: "const x = 2" },
      ],
    });
  });

  it("parses glob file lists", () => {
    const parsed = parseSearchOutput("src/a.ts\nsrc/b.tsx\n");
    expect(parsed).toEqual({ paths: ["src/a.ts", "src/b.tsx"] });
  });
});

describe("parseToolResult", () => {
  it("renders Read content as code and strips line prefixes", () => {
    const parsed = parseToolResult({
      tool: "Read",
      raw_input: { path: "crates/core-service/src/service/terminal.rs" },
      content: [{
        type: "text",
        text: "     1|pub fn boot() {}\n     2|pub fn stop() {}",
      }],
    });
    expect(parsed.presentation).toEqual({
      kind: "code",
      path: "crates/core-service/src/service/terminal.rs",
      language: "rust",
      code: "pub fn boot() {}\npub fn stop() {}",
    });
  });

  it("prefers ACP content text over missing raw_output", () => {
    const parsed = parseToolResult({
      tool: "Read",
      description: "Read: src/lib.rs",
      raw_input: { file_path: "src/lib.rs" },
      content: [{ type: "text", text: "fn main() {}\n" }],
    });
    expect(parsed.presentation.kind).toBe("code");
    if (parsed.presentation.kind === "code") {
      expect(parsed.presentation.code).toContain("fn main()");
    }
  });

  it("renders Edit diffs from structured content", () => {
    const parsed = parseToolResult({
      tool: "Edit",
      raw_input: { path: "src/a.ts" },
      content: [{
        type: "diff",
        path: "src/a.ts",
        old_content: "const a = 1;\n",
        new_content: "const a = 2;\n",
      }],
    });
    expect(parsed.presentation).toEqual({
      kind: "diff",
      files: [{
        path: "src/a.ts",
        oldContent: "const a = 1;\n",
        newContent: "const a = 2;\n",
      }],
    });
  });

  it("treats a brand-new file as code instead of an all-green diff", () => {
    const parsed = parseToolResult({
      tool: "Write",
      content: [{
        type: "diff",
        path: "src/new.ts",
        old_content: "",
        new_content: "export const n = 1;\n",
      }],
    });
    expect(parsed.presentation).toEqual({
      kind: "code",
      path: "src/new.ts",
      language: "typescript",
      code: "export const n = 1;\n",
      hint: "new",
    });
  });

  it("parses grep output as search hits", () => {
    const parsed = parseToolResult({
      tool: "Grep",
      raw_input: { pattern: "AgentTool" },
      raw_output: "apps/web/src/foo.ts:8:export function AgentTool() {}",
    });
    expect(parsed.presentation.kind).toBe("search");
    if (parsed.presentation.kind === "search") {
      expect(parsed.presentation.hits[0]?.path).toBe("apps/web/src/foo.ts");
      expect(parsed.presentation.hits[0]?.line).toBe(8);
    }
  });

  it("parses glob output as a file list", () => {
    const parsed = parseToolResult({
      tool: "Glob",
      raw_input: { glob: "**/*.rs" },
      raw_output: "src/a.rs\nsrc/b.rs\n",
    });
    expect(parsed.presentation).toEqual({
      kind: "files",
      paths: ["src/a.rs", "src/b.rs"],
    });
  });

  it("pretty-prints JSON objects", () => {
    const parsed = parseToolResult({
      tool: "Tool",
      raw_output: { ok: true, count: 2 },
    });
    expect(parsed.presentation.kind).toBe("json");
    if (parsed.presentation.kind === "json") {
      expect(parsed.presentation.json).toContain('"ok": true');
    }
  });

  it("parses todo lists from input", () => {
    const parsed = parseToolResult({
      tool: "TodoWrite",
      raw_input: {
        todos: [
          { content: "Parse tools", status: "completed" },
          { content: "Render diffs", status: "in_progress" },
        ],
      },
    });
    expect(parsed.presentation.kind).toBe("todos");
    if (parsed.presentation.kind === "todos") {
      expect(parsed.presentation.todos).toHaveLength(2);
    }
  });

  it("surfaces failed tools as errors when there is no other payload", () => {
    const parsed = parseToolResult({
      tool: "Read",
      status: "failed",
      description: "Read: missing.ts",
      raw_output: { message: "File not found" },
    });
    expect(parsed.presentation).toEqual({
      kind: "error",
      text: "File not found",
    });
  });

  it("treats a failed Read string output as an error instead of a code file", () => {
    const parsed = parseToolResult({
      tool: "Read",
      status: "failed",
      raw_input: { path: "missing.ts" },
      raw_output: "ENOENT: no such file",
    });
    expect(parsed.presentation).toEqual({
      kind: "error",
      text: "ENOENT: no such file",
    });
  });

  it("keeps a unified diff patch as a patch presentation", () => {
    const patch = "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n";
    const parsed = parseToolResult({
      tool: "Edit",
      raw_output: patch,
    });
    expect(parsed.presentation).toEqual({
      kind: "patch",
      path: null,
      patch,
    });
  });

  it("renders failed Read content text as an error, not a code file", () => {
    const parsed = parseToolResult({
      tool: "Read",
      status: "failed",
      raw_input: { path: "missing.ts" },
      content: [{ type: "text", text: "File not found" }],
    });
    expect(parsed.presentation).toEqual({
      kind: "error",
      text: "File not found",
    });
  });

  it("keeps a failed Edit diff instead of replacing it with an error", () => {
    const parsed = parseToolResult({
      tool: "Edit",
      status: "failed",
      content: [{
        type: "diff",
        path: "src/a.ts",
        old_content: "const a = 1;\n",
        new_content: "const a = 2;\n",
      }],
      raw_output: { message: "Permission denied" },
    });
    expect(parsed.presentation.kind).toBe("diff");
  });

  it("treats unnamed grep-like output as search hits, not a code file named after the search root", () => {
    const parsed = parseToolResult({
      tool: "Tool",
      raw_input: { path: "apps/web", pattern: "AgentTool" },
      raw_output: [
        "apps/web/src/foo.ts:8:export function AgentTool() {}",
        "apps/web/src/bar.ts:1:AgentTool",
      ].join("\n"),
    });
    expect(parsed.presentation.kind).toBe("search");
    if (parsed.presentation.kind === "search") {
      expect(parsed.presentation.hits).toHaveLength(2);
    }
  });

  it("renders WebSearch markdown instead of treating it as a search hit list", () => {
    const parsed = parseToolResult({
      tool: "WebSearch",
      raw_output: "# Results\n\n- [Atmos](https://atmos.land)\n",
    });
    expect(parsed.presentation).toEqual({
      kind: "markdown",
      markdown: "# Results\n\n- [Atmos](https://atmos.land)\n",
    });
  });

  it("does not render a one-line Edit status as a code file", () => {
    const parsed = parseToolResult({
      tool: "Write",
      raw_input: { path: "src/a.ts" },
      raw_output: "Successfully wrote src/a.ts",
    });
    expect(parsed.presentation).toEqual({
      kind: "text",
      text: "Successfully wrote src/a.ts",
    });
  });

  it("uses Write input contents as a new file when there is no diff payload", () => {
    const parsed = parseToolResult({
      tool: "Write",
      raw_input: { path: "src/a.ts", contents: "export const n = 1;\n" },
    });
    expect(parsed.presentation).toEqual({
      kind: "code",
      path: "src/a.ts",
      language: "typescript",
      code: "export const n = 1;\n",
      hint: "new",
    });
  });

  it("renders Move and Delete presentations", () => {
    expect(parseToolResult({
      tool: "Move",
      raw_input: { from: "src/a.ts", to: "src/b.ts" },
    }).presentation).toEqual({
      kind: "move",
      from: "src/a.ts",
      to: "src/b.ts",
    });
    expect(parseToolResult({
      tool: "Delete",
      raw_input: { path: "src/gone.ts" },
    }).presentation).toEqual({
      kind: "delete",
      path: "src/gone.ts",
    });
  });

  it("treats a deleted-file diff as code with a deleted hint", () => {
    const parsed = parseToolResult({
      tool: "Edit",
      content: [{
        type: "diff",
        path: "src/gone.ts",
        old_content: "export const n = 1;\n",
        new_content: "",
      }],
    });
    expect(parsed.presentation).toEqual({
      kind: "code",
      path: "src/gone.ts",
      language: "typescript",
      code: "export const n = 1;\n",
      hint: "deleted",
    });
  });

  it("shows Read offset and limit as input rows", () => {
    const parsed = parseToolResult({
      tool: "Read",
      raw_input: { path: "src/a.ts", offset: 10, limit: 40 },
      content: [{ type: "text", text: "fn main() {}\n" }],
    });
    expect(parsed.showInput).toBe(true);
    expect(parsed.inputRows).toEqual([
      { key: "offset", value: "10" },
      { key: "limit", value: "40" },
    ]);
  });

  it("collects a diff object from raw_output", () => {
    const parsed = parseToolResult({
      tool: "Edit",
      raw_output: {
        name: "src/a.ts",
        old_content: "a\n",
        new_content: "b\n",
      },
    });
    expect(parsed.presentation).toEqual({
      kind: "diff",
      files: [{
        path: "src/a.ts",
        oldContent: "a\n",
        newContent: "b\n",
      }],
    });
  });
});
