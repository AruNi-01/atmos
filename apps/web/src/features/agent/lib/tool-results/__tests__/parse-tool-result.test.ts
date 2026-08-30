import { describe, expect, it } from "bun:test";
import {
  displayToolPath,
  displayToolTitle,
  extractOutputText,
  languageFromPath,
  parseSearchOutput,
  parseToolResult,
  pathRelativeToCwd,
  relativeDisplayPath,
  resolveTreeEntryPaths,
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

  it("strips sparse Grok content_concise arrows", () => {
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
  it("unwraps Grok ListDir envelopes into a titled directory listing", () => {
    const parsed = parseToolResult({
      tool: "Tool",
      description: "Tool",
      raw_output: {
        type: "ListDir",
        Content: {
          content: "- /tmp/app/\n  - README.md\n  - src/\n    - main.ts\n      [2 files in subtree: 2 *.ts]",
          absolute_root_path: "/tmp/app",
        },
      },
    });
    expect(parsed.resolvedTool).toBe("ListDir");
    expect(parsed.path).toBe("/tmp/app");
    expect(parsed.presentation.kind).toBe("tree");
    if (parsed.presentation.kind === "tree") {
      expect(parsed.presentation.entries.map((entry) => entry.name)).toEqual([
        "/tmp/app",
        "README.md",
        "src",
        "main.ts",
        "2 files in subtree: 2 *.ts",
      ]);
      expect(parsed.presentation.entries[2]?.isDir).toBe(true);
      expect(parsed.presentation.entries[4]?.kind).toBe("note");
      expect(resolveTreeEntryPaths(parsed.presentation.entries)).toEqual([
        "/tmp/app",
        "/tmp/app/README.md",
        "/tmp/app/src",
        "/tmp/app/src/main.ts",
        "2 files in subtree: 2 *.ts",
      ]);
    }
    expect(parsed.showInput).toBe(false);
  });

  it("parses Grok GrepSearch file_matches instead of the summary line", () => {
    const parsed = parseToolResult({
      tool: "Tool",
      description: "Tool",
      content: [{ type: "text", text: "found 17 matches" }],
      raw_output: {
        type: "GrepSearch",
        match_count: 17,
        file_matches: [
          {
            path: "README.md",
            matches: [
              { line_number: 3, content: "# ATMOS" },
              { line_number: 211, content: "# Run in desktop" },
            ],
          },
          {
            path: "specs/README.md",
            matches: [{ line_number: 1, content: "# Specifications" }],
          },
        ],
      },
    });
    expect(parsed.resolvedTool).toBe("GrepSearch");
    expect(parsed.presentation.kind).toBe("search");
    if (parsed.presentation.kind === "search") {
      expect(parsed.presentation.hits).toEqual([
        { path: "README.md", line: 3, text: "# ATMOS" },
        { path: "README.md", line: 211, text: "# Run in desktop" },
        { path: "specs/README.md", line: 1, text: "# Specifications" },
      ]);
    }
  });

  it("unwraps Grok ReadFile envelopes and prefers raw file content", () => {
    const parsed = parseToolResult({
      tool: "Tool",
      description: "Tool",
      content: [{ type: "text", text: "1→# Title\n\nbody\n10→more" }],
      raw_output: {
        type: "ReadFile",
        FileContent: {
          content: "1→# Title\n\nbody\n10→more",
          absolute_path: "/tmp/app/README.md",
          offset: null,
          limit: 150,
          raw_output: "# Title\n\nbody\nmore",
          total_lines: 300,
        },
      },
    });
    expect(parsed.resolvedTool).toBe("ReadFile");
    expect(parsed.path).toBe("/tmp/app/README.md");
    expect(parsed.lineRange).toEqual({ start: 1, end: 150, total: 300 });
    expect(parsed.presentation).toEqual({
      kind: "code",
      path: "/tmp/app/README.md",
      language: "markdown",
      code: "# Title\n\nbody\nmore",
    });
  });

  it("reads Cursor ACP location-style path, offset, and command args", () => {
    const read = parseToolResult({
      tool: "Read",
      description: "Read",
      raw_input: { path: "/tmp/app/README.md", offset: 1, limit: 200 },
      content: [{ type: "text", text: "# Title\n" }],
    });
    expect(read.path).toBe("/tmp/app/README.md");
    expect(read.lineRange).toEqual({ start: 1, end: 200, total: undefined });
    expect(read.presentation.kind).toBe("code");

    const nested = parseToolResult({
      tool: "Read",
      description: "Read",
      raw_input: { args: { path: "apps/web/src/foo.ts", start_line: 10, end_line: 40 } },
      content: [{ type: "text", text: "export const x = 1;\n" }],
    });
    expect(nested.path).toBe("apps/web/src/foo.ts");
    expect(nested.lineRange).toEqual({ start: 10, end: 40, total: undefined });

    const search = parseToolResult({
      tool: "Search",
      description: "Search",
      raw_input: { pattern: "ActivityIndicator", glob: "*.ts" },
      content: [{ type: "text", text: "apps/web/src/foo.ts:12:  const x = 1" }],
    });
    expect(search.presentation.kind).toBe("search");
  });

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

  it("renders a brand-new file as a Pierre diff against empty old content", () => {
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
      kind: "diff",
      files: [{
        path: "src/new.ts",
        oldContent: "",
        newContent: "export const n = 1;\n",
      }],
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

  it("does not treat a loaded-tools notice as a Read file", () => {
    const parsed = parseToolResult({
      tool: "Read",
      raw_output: "Loaded 2 tool(s): WebSearch, FetchUrl",
    });
    expect(parsed.presentation).toEqual({
      kind: "text",
      text: "WebSearch, FetchUrl",
    });
  });

  it("renders URL Content from: dumps as a fetch, not a generic tool", () => {
    const raw = [
      'URL Content from: "https://example.com/page"',
      "Title: Example Page",
      "Status: 200",
      "Markdown content:",
      "# Example",
      "",
      "Hello from the page.",
    ].join("\n");
    const parsed = parseToolResult({
      tool: "Tool",
      description: "Tool",
      raw_output: raw,
    });
    expect(parsed.presentation.kind).toBe("web_fetch");
    if (parsed.presentation.kind === "web_fetch") {
      expect(parsed.presentation.url).toBe("https://example.com/page");
      expect(parsed.presentation.title).toBe("Example Page");
      expect(parsed.presentation.markdown).toContain("# Example");
      expect(parsed.presentation.markdown).not.toContain("URL Content from");
    }
  });

  it("renders Web Search Results for: dumps as web search, not a code preview", () => {
    const raw = [
      'Web Search Results for: "example query"',
      "",
      "**Atmos Land**",
      "URL: https://example.com/page",
      "A short snippet about the site.",
      "",
      "---",
      "",
      "**Other Result**",
      "URL: https://example.com/other",
    ].join("\n");

    for (const tool of ["search", "Search", "Tool", "web_search"]) {
      const parsed = parseToolResult({ tool, raw_output: raw });
      expect(parsed.presentation.kind).toBe("web_search");
      if (parsed.presentation.kind === "web_search") {
        expect(parsed.presentation.query).toBe("example query");
        expect(parsed.presentation.links.map((link) => link.url)).toEqual([
          "https://example.com/page",
          "https://example.com/other",
        ]);
        expect(parsed.presentation.links[0]?.title).toBe("Atmos Land");
      }
    }
  });

  it("renders WebSearch markdown instead of treating it as a search hit list", () => {
    const parsed = parseToolResult({
      tool: "WebSearch",
      raw_output: "# Results\n\n- [Example](https://example.com)\n",
    });
    expect(parsed.presentation.kind).toBe("web_search");
    if (parsed.presentation.kind === "web_search") {
      expect(parsed.presentation.links[0]).toEqual({
        url: "https://example.com",
        title: "Example",
      });
    }
  });

  it("renders web search input sources instead of raw JSON", () => {
    const parsed = parseToolResult({
      tool: "Web search",
      raw_input: {
        backend: true,
        action: {
          type: "search",
          query: "example search",
          sources: [
            { type: "url", url: "https://example.com/repo" },
            { type: "url", url: "https://example.com/repo/tags" },
          ],
        },
      },
    });
    expect(parsed.presentation).toMatchObject({
      kind: "web_search",
      query: "example search",
    });
    if (parsed.presentation.kind === "web_search") {
      expect(parsed.presentation.links.map((link) => link.url)).toEqual([
        "https://example.com/repo",
        "https://example.com/repo/tags",
      ]);
    }
    expect(parsed.showInput).toBe(false);
  });

  it("treats a web-search open_page action as a fetch, not raw JSON", () => {
    const parsed = parseToolResult({
      tool: "Web search",
      raw_input: {
        action: { type: "open_page", url: "https://example.com/page" },
        id: "ws_call_1",
      },
      raw_output: {
        action: { type: "open_page", url: "https://example.com/page" },
        id: "ws_call_1",
      },
    });
    expect(parsed.presentation.kind).toBe("web_fetch");
    if (parsed.presentation.kind === "web_fetch") {
      expect(parsed.presentation.url).toBe("https://example.com/page");
      expect(parsed.presentation.text).toBeUndefined();
    }
    expect(parsed.showInput).toBe(false);
  });

  it("keeps a failed fetch on the URL instead of dropping to a generic error card", () => {
    const parsed = parseToolResult({
      tool: "Fetch",
      status: "failed",
      raw_input: { url: "https://example.com/page" },
      raw_output: { message: "Request failed" },
    });
    expect(parsed.presentation.kind).toBe("web_fetch");
    if (parsed.presentation.kind === "web_fetch") {
      expect(parsed.presentation.url).toBe("https://example.com/page");
      expect(parsed.presentation.text).toContain("Request failed");
    }
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

  it("uses Write input contents as a diff against empty old content", () => {
    const parsed = parseToolResult({
      tool: "Write",
      raw_input: { path: "src/a.ts", contents: "export const n = 1;\n" },
    });
    expect(parsed.presentation).toEqual({
      kind: "diff",
      files: [{
        path: "src/a.ts",
        oldContent: "",
        newContent: "export const n = 1;\n",
      }],
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

  it("treats a deleted-file diff as a Pierre diff", () => {
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
      kind: "diff",
      files: [{
        path: "src/gone.ts",
        oldContent: "export const n = 1;\n",
        newContent: "",
      }],
    });
  });

  it("unwraps Grok SearchReplace envelopes into a Pierre diff", () => {
    const parsed = parseToolResult({
      tool: "Tool",
      content: [{
        type: "diff",
        path: "/tmp/app/INTRO.md",
        old_content: "",
        new_content: "# Atmos\n",
      }],
      raw_output: {
        type: "SearchReplace",
        EditsApplied: {
          old_string: "",
          new_string: "# Atmos\n",
          absolute_path: "/tmp/app/INTRO.md",
        },
      },
    });
    expect(parsed.resolvedTool).toBe("SearchReplace");
    expect(parsed.path).toBe("/tmp/app/INTRO.md");
    expect(parsed.presentation).toEqual({
      kind: "diff",
      files: [{
        path: "/tmp/app/INTRO.md",
        oldContent: "",
        newContent: "# Atmos\n",
      }],
    });
  });

  it("builds a SearchReplace diff from old_string/new_string when ACP content is missing", () => {
    const parsed = parseToolResult({
      tool: "Tool",
      raw_output: {
        type: "SearchReplace",
        EditsApplied: {
          old_string: "const a = 1;\n",
          new_string: "const a = 2;\n",
          absolute_path: "/tmp/app/src/a.ts",
        },
      },
    });
    expect(parsed.presentation).toEqual({
      kind: "diff",
      files: [{
        path: "/tmp/app/src/a.ts",
        oldContent: "const a = 1;\n",
        newContent: "const a = 2;\n",
      }],
    });
  });

  it("captures Read offset and limit as a line range instead of input rows", () => {
    const parsed = parseToolResult({
      tool: "Read",
      raw_input: { path: "src/a.ts", offset: 10, limit: 40 },
      content: [{ type: "text", text: "fn main() {}\n" }],
    });
    expect(parsed.showInput).toBe(false);
    expect(parsed.lineRange).toEqual({ start: 10, end: 49 });
    expect(parsed.presentation.kind).toBe("code");
  });

  it("uses FileContent offset so a partial Read keeps its real start line", () => {
    const parsed = parseToolResult({
      tool: "Tool",
      raw_output: {
        type: "ReadFile",
        FileContent: {
          absolute_path: "/tmp/app/src/a.ts",
          offset: 40,
          limit: 20,
          total_lines: 200,
          raw_output: "export function foo() {\n  return 1;\n}\n",
        },
      },
    });
    expect(parsed.lineRange).toEqual({ start: 40, end: 59, total: 200 });
    expect(parsed.presentation).toEqual({
      kind: "code",
      path: "/tmp/app/src/a.ts",
      language: "typescript",
      code: "export function foo() {\n  return 1;\n}\n",
    });
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

  it("decodes Grok Bash byte output instead of dumping the envelope JSON", () => {
    const stdout = "     774 apps/web/src/foo.ts\n    1196 apps/web/src/bar.ts\n";
    const parsed = parseToolResult({
      tool: "Tool",
      raw_input: { command: "wc -l apps/web/src/foo.ts" },
      raw_output: {
        type: "Bash",
        output: Array.from(new TextEncoder().encode(stdout)),
        output_for_prompt: `exit: 0\n${stdout}`,
        exit_code: 0,
        command: "wc -l apps/web/src/foo.ts",
        current_dir: "/Users/aarynlu/OpenSource/atmos",
        truncated: false,
        signal: null,
        timed_out: false,
      },
    });
    expect(parsed.resolvedTool).toBe("Bash");
    expect(parsed.presentation).toEqual({ kind: "text", text: stdout });
  });
});

describe("extractOutputText", () => {
  it("decodes a byte array as UTF-8 stdout", () => {
    const stdout = "hello from bash\n";
    expect(extractOutputText({
      type: "Bash",
      output: Array.from(new TextEncoder().encode(stdout)),
      output_for_prompt: "exit: 0\nignored",
    })).toBe(stdout);
  });

  it("falls back to output_for_prompt without the exit prefix", () => {
    expect(extractOutputText({
      type: "Bash",
      output: [],
      output_for_prompt: "exit: 0\nreal output\n",
    })).toBe("real output\n");
  });
});
