// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import type { AgentToolCallPart } from "@atmos/agent-transcript";
import { darkColors, lightColors } from "../../theme/colors";
import { importPure } from "./process-fold.test";

type Body = {
  kind: string;
  title?: string;
  status?: string;
  path?: string | null;
  text?: string;
  language?: string;
  hint?: "new" | "deleted" | null;
  from?: string;
  to?: string;
  query?: string;
  markdown?: string;
  additions?: number;
  deletions?: number;
  paths?: string[];
  shown?: string[];
  rows?: Array<{
    name: string;
    path: string;
    indent: number;
    isDir: boolean;
    note: boolean;
  }>;
  summary?: string;
  body?: string;
  url?: string;
  openable?: boolean;
  files?: Array<{
    path: string;
    additions: number;
    deletions: number;
    lines: Array<{
      op: string;
      text: string;
      oldNo?: number | null;
      newNo?: number | null;
    }>;
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
    expect(diff.files?.[0]?.lines).toEqual([
      { op: "ctx", text: "a", oldNo: 1, newNo: 1 },
      { op: "del", text: "b", oldNo: 2, newNo: null },
      { op: "add", text: "c", oldNo: null, newNo: 2 },
    ]);

    const stats = await call(
      part({
        kind: "edit",
        params: { type: "edit", path: "a.ts" },
        result: { type: "diff_stats", path: "a.ts", additions: 2, deletions: 1 },
      }),
    );
    expect(stats).toMatchObject({ kind: "diff_stats", path: "a.ts", additions: 2, deletions: 1 });
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-body.tsx"),
      "utf8",
    );
    const view = source.slice(source.indexOf("// @view"));
    const statsBody = view.slice(view.indexOf('case "diff_stats":'), view.indexOf('case "patch":'));
    expect(statsBody).toContain("copy.lineChanges");
    expect(statsBody).toContain("ToolDiffStats");
    expect(statsBody).not.toContain("PathChip");
    expect(statsBody).not.toContain("DiffCounts");
    const discussion = view.slice(
      view.indexOf("function DiscussionDiff"),
      view.indexOf("function fetchRowUrl"),
    );
    expect(discussion).toContain("TOOL_DIFF_MAX_HEIGHT");
    expect(discussion).toContain("<HeightClip maxHeight={TOOL_DIFF_MAX_HEIGHT} wrap>");
    expect(discussion).toContain("minWidth: 0");
    expect(discussion).toContain("TOOL_DIFF_RADIUS");
    expect(discussion).toContain("TOOL_DIFF_HEADER_LIGHT");
    expect(discussion).toContain("shadowOpacity: 0.1");
    expect(discussion).toContain("toolDiffLineFill(line.op, theme.isDark)");
    expect(discussion).toContain("toolDiffNumberFill(line.op, theme.isDark)");
    expect(discussion).toContain("TOOL_DIFF_GUTTER_RULE");
    expect(discussion).toContain("theme.colors.background");
    expect(discussion).not.toContain("greenSurface");
    expect(discussion).not.toContain("redSurface");
    expect(discussion).toContain("toolDiffUnifiedLineNo(line)");
    expect(discussion.split("toolDiffUnifiedLineNo(line)").length - 1).toBe(1);
    expect(discussion).toContain("toolDiffNumberColumnWidth");
    expect(discussion).toContain("TOOL_DIFF_BAR");
    expect(discussion).toContain("DiffDeletionBar");
    const hatch = view.slice(
      view.indexOf("function DiffDeletionBar"),
      view.indexOf("function DiscussionDiff"),
    );
    expect(hatch).toContain("<Rect fill={ink} height={1} width={TOOL_DIFF_BAR} />");
    expect(hatch).toContain("<Rect fill={band} height={1} width={TOOL_DIFF_BAR} y={1} />");
    expect(discussion).toContain('line.op === "add"');
    expect(discussion).toContain('line.op === "del"');
    expect(discussion).toContain('toolDiffLineFill("del", theme.isDark)');
    expect(discussion).toContain("toolDiffContextNumber(theme.isDark)");
    expect(discussion).toContain("toolDiffLineWordPieces(lines)");
    expect(discussion).toContain("toolDiffWordFill(line.op, theme.isDark)");
    expect(discussion).toContain("piece.changed ? { backgroundColor: wordFill }");
    expect(discussion).toContain("toolDiffVisibleRows(segments, revealed)");
    expect(discussion).toContain("DiffHunkSeparator");
    expect(discussion).toContain("line.noNewline");
    expect(discussion).toContain("DiffNoNewlineNote");
    const newlineNote = view.slice(
      view.indexOf("function DiffNoNewlineNote"),
      view.indexOf("function DiscussionDiff"),
    );
    expect(newlineNote).toContain("TOOL_DIFF_NO_NEWLINE_LABEL");
    expect(newlineNote).toContain("TOOL_DIFF_NO_NEWLINE_OPACITY");
    expect(newlineNote).toContain("TOOL_DIFF_FG_LIGHT");
    expect(newlineNote).not.toContain("TOOL_DIFF_BAR");
    expect(discussion).toContain("toolDiffRevealMore(current[row.segment], direction)");
    const separator = view.slice(
      view.indexOf("function DiffExpandGlyph"),
      view.indexOf("function DiscussionDiff"),
    );
    expect(separator).toContain("toolDiffUnmodifiedLabel(row.count)");
    expect(separator).toContain("TOOL_DIFF_SEPARATOR_HEIGHT");
    expect(separator).toContain("TOOL_DIFF_EXPAND_BUTTON");
    expect(separator).toContain("toolDiffExpandButtons(row.place, row.range)");
    expect(separator).toContain("toolDiffSeparatorMargin(row.place)");
    expect(separator).toContain('direction === "down" ? { transform: [{ scaleY: -1 }] }');
    expect(discussion).not.toContain("minWidth: 28");
    expect(discussion).toContain("FileTextIcon");
    expect(discussion).not.toContain("PathChip");
    expect(discussion).not.toContain("theme.colors.glassBorder");
    expect(discussion).not.toContain("theme.colors.cardSubtle");
    expect(discussion).not.toContain("DiffCounts");
    const diffCase = view.slice(view.indexOf('case "diff":'), view.indexOf('case "diff_stats":'));
    expect(diffCase).toContain("DiscussionDiff");
    const patchCase = view.slice(view.indexOf('case "patch":'), view.indexOf('case "code":'));
    expect(patchCase).toContain("toolDiffSegmentsFromPatch");
    expect(patchCase).not.toContain("CappedMono");
    expect(patchCase).not.toContain("PathChip");
    const mod = await importPure("tool-body.tsx");
    expect(mod.TOOL_DIFF_MAX_HEIGHT).toBe(448);
    expect(mod.TOOL_ADDITION_COLOR).toBe("#00c950");
    expect(mod.TOOL_DELETION_COLOR).toBe("#fb2c36");
    expect(mod.TOOL_DIFF_CODE_FONT).toBe(13);
    expect(mod.TOOL_DIFF_LINE_HEIGHT).toBe(20);
    expect(mod.TOOL_DIFF_NUMBER_PAD_LEFT).toBe(15.6);
    expect(mod.TOOL_DIFF_NUMBER_PAD_RIGHT).toBe(7.8);
    expect(mod.TOOL_DIFF_CODE_PAD).toBe(7.8);
    expect(mod.TOOL_DIFF_BAR).toBe(4);
    expect(mod.TOOL_DIFF_NUMBER_ADD_LIGHT).toBe("#0dbe4e");
    expect(mod.TOOL_DIFF_NUMBER_ADD_DARK).toBe("#5ecc71");
    expect(mod.TOOL_DIFF_NUMBER_DEL_LIGHT).toBe("#ff2e3f");
    expect(mod.TOOL_DIFF_NUMBER_DEL_DARK).toBe("#ff6762");
    expect(mod.TOOL_DIFF_NUMBER_CONTEXT_LIGHT).toBe("#4f4f50");
    expect(mod.TOOL_DIFF_NUMBER_CONTEXT_DARK).toBe("#9e9e9e");
    expect(mod.toolDiffContextNumber(false)).toBe("#4f4f50");
    expect(mod.toolDiffContextNumber(true)).toBe("#9e9e9e");
    expect(mod.toolDiffNumberColumnWidth(2)).toBe(46.8);
    expect(mod.toolDiffNumberColumnWidth(999)).toBe(46.8);
    expect(mod.toolDiffNumberColumnWidth(1000)).toBe(54.6);
    expect(mod.toolDiffUnifiedLineNo({ op: "ctx", oldNo: 1, newNo: 4 })).toBe(4);
    expect(mod.toolDiffUnifiedLineNo({ op: "del", oldNo: 2, newNo: null })).toBe(2);
    expect(mod.toolDiffUnifiedLineNo({ op: "add", oldNo: null, newNo: 9 })).toBe(9);
    expect(mod.TOOL_DIFF_GUTTER_RULE).toBe(2);
    expect(mod.toolDiffLineFill("add", false)).toBe("#dfeee2");
    expect(mod.toolDiffLineFill("del", false)).toBe("#fbe0de");
    expect(mod.toolDiffLineFill("add", true)).toBe("#1a291b");
    expect(mod.toolDiffLineFill("del", true)).toBe("#321a18");
    expect(mod.toolDiffNumberFill("add", false)).toBe("#e4f0e7");
    expect(mod.toolDiffNumberFill("del", false)).toBe("#fae5e4");
    expect(mod.toolDiffNumberFill("add", true)).toBe("#152016");
    expect(mod.toolDiffNumberFill("del", true)).toBe("#271614");
    expect(lightColors.background).toBe("#f4f4f6");
    expect(darkColors.background).toBe("#000000");
    const counts = view.slice(
      view.indexOf("function ToolDiffStats"),
      view.indexOf("function ShowMoreButton"),
    );
    expect(counts).toContain("TOOL_DELETION_COLOR");
    expect(counts).toContain("TOOL_ADDITION_COLOR");
    expect(counts).toContain("marginHorizontal: 4");
    expect(counts).not.toContain(" / ");
    expect(counts).not.toContain("theme.colors.green");
    expect(counts).not.toContain("theme.colors.red");
    const patchLines = mod.patchDiffLines as (patch: string) => Array<{
      op: string;
      text: string;
      oldNo: number | null;
      newNo: number | null;
    }>;
    expect(patchLines("@@ -1,2 +1,2 @@\n a\n-b\n+c\n")).toEqual([
      { op: "ctx", text: "a", oldNo: 1, newNo: 1 },
      { op: "del", text: "b", oldNo: 2, newNo: null },
      { op: "add", text: "c", oldNo: null, newNo: 2 },
    ]);

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
    expect(code).toMatchObject({
      kind: "code",
      path: "a.ts",
      text: "const a = 1;\n",
      language: "typescript",
      hint: null,
      lineStart: 1,
    });
    const ranged = await call(
      part({
        kind: "read",
        params: { type: "read", path: "a.ts", offset: 40, limit: 3 },
        result: { type: "file_content", path: "a.ts", text: "a\nb\nc\n" },
      }),
    );
    expect(ranged).toMatchObject({ kind: "code", lineStart: 40 });
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

    const untitled = await call(
      part({
        kind: "web_search",
        params: { type: "web_search", query: "atmos" },
        result: {
          type: "web_search",
          query: "atmos",
          links: [{ url: "https://www.example.com/docs", title: "  " }],
        },
      }),
    );
    expect(untitled.links?.[0]?.title).toBe("www.example.com");

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
      body: "# Docs",
      format: "markdown",
    });

    const plain = await call(
      part({
        kind: "fetch",
        params: { type: "fetch", url: "https://atmos.dev/plain" },
        result: { type: "web_fetch", url: "https://atmos.dev/plain", text: "plain" },
      }),
    );
    expect(plain).toMatchObject({ kind: "web_fetch", body: "plain", format: "text" });

    const failed = await call(
      part({
        kind: "fetch",
        status: "failed",
        params: { type: "fetch", url: "https://atmos.dev/plain" },
        result: {
          type: "web_fetch",
          url: "https://atmos.dev/plain",
          markdown: "# Docs",
          text: "boom",
        },
      }),
    );
    expect(failed).toMatchObject({ kind: "web_fetch", body: "boom", format: "error" });

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
    expect(hits).toMatchObject({
      kind: "search",
      query: "fn main",
      script: "fn main",
      matchCount: 1,
      groups: [{ path: "src/main.rs", shown: "main.rs", hits: [{ line: 4, text: "fn main" }] }],
    });

    const summary = await call(
      part({
        kind: "search",
        params: { type: "search", query: "fn", glob: "*.rs", path: "src" },
        result: { type: "text", text: "found 3 matches" },
      }),
    );
    expect(summary).toMatchObject({
      kind: "search",
      script: "fn *.rs src",
      groups: [],
      summary: "found 3 matches",
      matchCount: 3,
    });

    const files = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
        result: { type: "other", value: { kind: "files", paths: ["a.ts", "b.ts"] } },
      }),
    );
    expect(files).toMatchObject({
      kind: "files",
      paths: ["a.ts", "b.ts"],
      shown: ["a.ts", "b.ts"],
    });

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
    expect(tree).toMatchObject({
      kind: "tree",
      rows: [
        { name: "src", path: "src", indent: 0, isDir: true, note: false },
        { name: "a.ts", path: "src/a.ts", indent: 1, isDir: false, note: false },
      ],
    });

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
    expect(todos.items?.[0]).toMatchObject({ content: "Ship it", status: "in_progress" });
  });

  test("file and tree lists shorten paths and keep tree shape", async () => {
    const mod = await importPure("tool-body.tsx");
    const looksLikeDirectory = mod.pathLooksLikeDirectory as (path: string) => boolean;
    expect(looksLikeDirectory("a.ts")).toBe(false);
    expect(looksLikeDirectory("src")).toBe(true);
    expect(looksLikeDirectory("src/")).toBe(true);
    const shown = mod.fileListShown as (paths: readonly string[]) => string[];
    expect(shown(["src/main.rs"])).toEqual(["main.rs"]);
    expect(mod.TOOL_FILE_LIST_MAX_HEIGHT).toBe(288);

    const note = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
        result: {
          type: "other",
          value: {
            kind: "tree",
            entries: [{ name: "truncated", indent: 0, isDir: false, kind: "note" }],
          },
        },
      }),
    );
    expect(note.rows).toEqual([
      { name: "truncated", path: "truncated", indent: 0, isDir: false, note: true },
    ]);

    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-body.tsx"),
      "utf8",
    );
    const view = source.slice(source.indexOf("// @view"));
    const lists = view.slice(
      view.indexOf("function PathGlyph"),
      view.indexOf("function TodoStatusRows"),
    );
    expect(lists).toContain("HeightClip");
    expect(lists).toContain("FolderIcon");
    expect(lists).toContain("FileTextIcon");
    expect(lists).toContain("TOOL_FILE_LIST_MAX_HEIGHT");
    expect(lists).toContain("row.name");
    expect(lists).toContain("12 + row.indent * 8");
    expect(lists).not.toContain("PathChip");
    const branch = view.slice(view.indexOf('case "files":'), view.indexOf('case "markdown":'));
    expect(branch).toContain("<FileListBody");
    expect(branch).toContain("<TreeListBody");
    expect(branch).not.toContain("PathChips");
  });

  test("tool markdown clips at the web preview height", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-body.tsx"),
      "utf8",
    );
    const view = source.slice(source.indexOf("// @view"));
    const markdown = view.slice(view.indexOf('case "markdown":'), view.indexOf('case "todos":'));
    expect(markdown).toContain("HeightClip");
    expect(markdown).toContain("TOOL_CODE_MAX_HEIGHT");
    expect(markdown).toContain("fontSize={13}");
    expect(markdown).toContain("lineHeight={TOOL_MARKDOWN_LINE_HEIGHT}");
    expect(markdown).not.toContain("lineHeight={21}");
    expect(markdown).toContain('prose="tool"');
    expect(markdown).toContain("paddingHorizontal: 12");
    expect(markdown).toContain("paddingVertical: 8");
  });

  test("fetch markdown clips and long text uses the preview", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-body.tsx"),
      "utf8",
    );
    const view = source.slice(source.indexOf("// @view"));
    const fetched = view.slice(view.indexOf('case "web_fetch":'), view.indexOf('case "search":'));
    expect(fetched).toContain("TOOL_CODE_MAX_HEIGHT");
    expect(fetched).toContain("fontSize={13}");
    expect(fetched).toContain("lineHeight={TOOL_MARKDOWN_LINE_HEIGHT}");
    expect(fetched).not.toContain("lineHeight={21}");
    expect(fetched).toContain('prose="tool"');
    expect(fetched).toContain("toolTextUsesPreview(model.body)");
    expect(fetched).toContain("<ToolPlainPreview");
  });

  test("mono, move, delete, error, empty, images, and subagent cards", async () => {
    const json = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
        result: { type: "other", value: { a: 1 } },
      }),
    );
    expect(json).toMatchObject({ kind: "preview", language: "json" });
    expect(json.text).toContain('"a": 1');

    const text = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
        result: { type: "text", text: "hello" },
      }),
    );
    expect(text).toMatchObject({ kind: "prose", text: "hello" });

    const wrapped = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
        result: { type: "text", text: "one\ntwo" },
      }),
    );
    expect(wrapped).toMatchObject({ kind: "preview", language: "plaintext", text: "one\ntwo" });

    const long = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
        result: { type: "text", text: "x".repeat(161) },
      }),
    );
    expect(long).toMatchObject({ kind: "preview", language: "plaintext" });

    const exact = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
        result: { type: "text", text: "x".repeat(160) },
      }),
    );
    expect(exact).toMatchObject({ kind: "prose" });
    const previewSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-body.tsx"),
      "utf8",
    );
    const previewView = previewSource.slice(previewSource.indexOf("// @view"));
    const preview = previewView.slice(
      previewView.indexOf("function ToolPlainPreview"),
      previewView.indexOf("function CappedMono"),
    );
    expect(preview).toContain("TOOL_CODE_MAX_HEIGHT");
    expect(preview).toContain("TOOL_PLAIN_LINE_FONT");
    expect(preview).toContain("TOOL_PLAIN_LINE_HEIGHT");
    expect(preview).toContain("TOOL_PLAIN_LINE_PAD_X");
    expect(preview).toContain("TOOL_PLAIN_LINE_PAD_Y");
    expect(preview).toContain("TOOL_PLAIN_NUMBER_FONT");
    expect(preview).toContain("toolPlainLineNumberWidth(lines.length)");
    expect(preview).not.toContain("minWidth: 28");
    expect(preview).toContain('fontFamily: "Menlo"');
    expect(preview).not.toContain("fontSize: 14");
    expect(preview).toContain("lines.length >= 2");
    expect(preview).toContain("CodeExpandButton");
    expect(preview).toContain("CODE_PREVIEW_EXPAND_TOP");
    expect(preview).toContain("CODE_PREVIEW_EXPAND_RIGHT");
    expect(preview).not.toContain("ShowMoreButton");
    expect(preview).not.toContain("HeightClip");
    expect(preview).not.toContain("AgentChatMarkdown");
    const previewMod = await importPure("tool-body.tsx");
    expect(previewMod.TOOL_PLAIN_LINE_FONT).toBe(13);
    expect(previewMod.TOOL_PLAIN_LINE_HEIGHT).toBe(21);
    expect(previewMod.TOOL_PLAIN_LINE_PAD_X).toBe(12);
    expect(previewMod.TOOL_PLAIN_LINE_PAD_Y).toBe(2);
    expect(previewMod.TOOL_PLAIN_NUMBER_FONT).toBe(12);
    expect(previewMod.TOOL_PLAIN_NUMBER_CH).toBe(7.2);
    expect(previewMod.toolPlainLineNumberWidth(2)).toBe(21.6);
    expect(previewMod.toolPlainLineNumberWidth(100)).toBe(21.6);
    expect(previewMod.toolPlainLineNumberWidth(1000)).toBe(28.8);
    const prose = previewView.slice(
      previewView.indexOf('case "prose":'),
      previewView.indexOf('case "execute":'),
    );
    expect(prose).toContain("fontSize: 14");
    expect(prose).toContain("lineHeight: TOOL_PROSE_LINE_HEIGHT");
    expect(prose).not.toContain("lineHeight: 23");
    expect(prose).not.toContain("Menlo");

    const executed = await call(
      part({
        kind: "execute",
        params: { type: "execute", command: "pwd", background: false },
        result: { type: "execute", output: "ok" },
      }),
    );
    expect(executed).toMatchObject({
      kind: "execute",
      command: "pwd",
      output: "ok",
      failed: false,
    });

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
    expect(emptyRead).toMatchObject({ kind: "empty", path: "a.ts", message: null });

    const emptyOther = await call(
      part({
        kind: "other",
        params: { type: "other", value: null },
      }),
    );
    expect(emptyOther).toMatchObject({ kind: "empty", path: null, message: "No output" });

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
    expect(images).toMatchObject({
      kind: "image_gen",
      prompt: "cat",
      status: "complete",
      aspect: 1,
    });
    expect(images.items).toEqual([{ uri: "https://example.com/cat.png" }, { path: "cat.png" }]);

    const imageGenEmpty = await call(
      part({
        kind: "image_gen",
        params: { type: "image_gen", prompt: "cat", path: "out.png" },
      }),
    );
    expect(imageGenEmpty).toMatchObject({
      kind: "image_gen",
      prompt: "cat",
      path: "out.png",
      status: "complete",
      items: [{ path: "out.png" }],
    });

    const plan = await call(
      part({
        kind: "plan_document",
        params: { type: "plan_document", plan: "# Plan", todos: [] },
      }),
    );
    expect(plan).toMatchObject({
      kind: "plan_document",
      title: "Plan",
      overview: null,
      plan: "# Plan",
      todos: [],
    });

    const subagent = await call(
      part({
        name: "Task",
        title: "Scout",
        kind: "subagent",
        status: "running",
        params: { type: "subagent", description: "look around" },
      }),
    );
    expect(subagent).toMatchObject({
      kind: "subagent",
      title: "Ran subagent look around",
      status: "Running",
    });
  });

  test("subagent row title follows description, then title, then name", async () => {
    const mod = await importPure("tool-body.tsx");
    const title = mod.subagentRowTitle as (row: AgentToolCallPart) => string;
    expect(
      title(
        part({
          kind: "subagent",
          title: "Scout",
          name: "Task",
          params: { type: "subagent", description: "look around" },
        }),
      ),
    ).toBe("Ran subagent look around");
    expect(
      title(
        part({
          kind: "subagent",
          title: "Scout",
          name: "Task",
          params: { type: "subagent", description: "  " },
        }),
      ),
    ).toBe("Ran subagent Scout");
    expect(
      title(
        part({
          kind: "subagent",
          name: "Task",
          params: { type: "subagent", description: "" },
        }),
      ),
    ).toBe("Ran subagent Task");
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-body.tsx"),
      "utf8",
    );
    const card = source.slice(
      source.indexOf("function SubagentCard"),
      source.indexOf("function ToolFileChip"),
    );
    expect(card).toContain("<TextShimmer ");
    expect(card).toContain("copy.subagentStatus.running");
    expect(card).toContain("chatDestructiveColor");
    expect(card).not.toContain("{status}");
    expect(source).toContain("title={model.title}");
  });

  test("nested children are timeline-hidden, and long mono text caps at 12 lines", async () => {
    const mod = await importPure("tool-body.tsx");
    const show = mod.showToolRow as (part: AgentToolCallPart) => boolean;
    const cap = mod.cappedToolText as (
      text: string,
      expanded: boolean,
    ) => { text: string; overflow: boolean };
    const nested = part({
      kind: "read",
      parent_tool_call_id: "parent",
      params: { type: "read", path: "a.ts" },
    });
    expect(show(nested)).toBe(false);
    expect(
      show(
        part({
          kind: "other",
          name: "TaskOutput",
          title: "Waiting for subagent",
          params: { type: "other", value: null },
        }),
      ),
    ).toBe(false);
    expect(show(part({ kind: "read", name: "Read", params: { type: "read", path: "a.ts" } }))).toBe(
      true,
    );
    const lines = Array.from({ length: 13 }, (_, index) => `line ${index + 1}`).join("\n");
    const collapsed = cap(lines, false);
    expect(collapsed.overflow).toBe(true);
    expect(collapsed.text.split("\n")).toHaveLength(12);
    expect(cap(lines, true).text.split("\n")).toHaveLength(13);
  });

  test("group diff totals count edit stats and skip other kinds", async () => {
    const mod = await importPure("tool-body.tsx");
    const totals = mod.toolGroupDiffTotals as (parts: AgentToolCallPart[]) => {
      additions: number;
      deletions: number;
    };
    const row = mod.toolRowDiffStats as (model: Body) => { additions: number; deletions: number };
    expect(
      totals([
        part({
          kind: "edit",
          params: { type: "edit", path: "a.ts" },
          result: { type: "diff_stats", path: "a.ts", additions: 3, deletions: 1 },
        }),
        part({
          kind: "read",
          params: { type: "read", path: "b.ts" },
          result: { type: "diff_stats", path: "b.ts", additions: 9, deletions: 9 },
        }),
      ]),
    ).toEqual({ additions: 3, deletions: 1 });
    expect(
      row({ kind: "diff_stats", title: "Edit", path: "a.ts", additions: 2, deletions: 4 }),
    ).toEqual({ additions: 2, deletions: 4 });
    expect(row({ kind: "prose", title: "Run", text: "ok" })).toEqual({
      additions: 0,
      deletions: 0,
    });
  });
});

describe("empty and failed tool fallbacks", () => {
  test("says Processing or No output, and Execution failed when the error is blank", async () => {
    const mod = await importPure("tool-body.tsx");
    const message = mod.emptyToolMessage as (
      kind: string,
      status: string | null | undefined,
      path: string | null,
    ) => string | null;
    const errorText = mod.toolErrorText as (text: string) => string;
    expect(message("other", "completed", null)).toBe("No output");
    expect(message("other", "running", null)).toBe("Processing...");
    expect(message("other", "", null)).toBe("Processing...");
    expect(message("read", "completed", "a.ts")).toBeNull();
    expect(message("edit", "completed", "a.ts")).toBeNull();
    expect(message("delete", "running", "gone.ts")).toBeNull();
    expect(message("read", "completed", null)).toBe("No output");
    expect(message("edit", "running", null)).toBe("Processing...");
    expect(errorText(" missing ")).toBe("missing");
    expect(errorText("")).toBe("Execution failed");
    expect(errorText("   ")).toBe("Execution failed");

    const running = await call(
      part({
        kind: "other",
        status: "running",
        params: { type: "other", value: null },
      }),
    );
    expect(running).toMatchObject({ kind: "empty", path: null, message: "Processing..." });

    const blank = await call(
      part({
        kind: "read",
        params: { type: "read", path: "a.ts" },
        result: { type: "error", message: " " },
      }),
    );
    expect(blank).toMatchObject({ kind: "error", text: "Execution failed" });
  });
});

describe("execute terminal", () => {
  test("keeps the command above output and titles a command echo Run Script", async () => {
    const mod = await importPure("tool-body.tsx");
    const model = mod.toolBodyModel as (value: AgentToolCallPart) => {
      kind: string;
      command?: string;
      output?: string;
      failed?: boolean;
      message?: string | null;
    };
    const present = (await import("@atmos/agent-transcript")).presentAgentTool;
    const chrome = mod.toolRowChrome as (
      part: AgentToolCallPart,
      parsed: ReturnType<typeof present>,
    ) => { title: string };

    const ran = model(
      part({
        kind: "execute",
        params: { type: "execute", command: " pwd ", background: false },
        result: { type: "execute", output: "ok" },
      }),
    );
    expect(ran).toMatchObject({ kind: "execute", command: " pwd ", output: "ok", failed: false });

    const failed = model(
      part({
        kind: "execute",
        status: "completed",
        params: { type: "execute", command: "pwd", background: false },
        result: { type: "error", message: " " },
      }),
    );
    expect(failed).toMatchObject({ kind: "execute", command: "pwd", output: " ", failed: true });

    const text = model(
      part({
        kind: "execute",
        params: { type: "execute", command: "ls", background: false },
        result: { type: "text", text: "a.ts" },
      }),
    );
    expect(text).toMatchObject({ kind: "execute", command: "ls", output: "a.ts", failed: false });

    const empty = model(
      part({
        kind: "execute",
        params: { type: "execute", command: "", background: false },
      }),
    );
    expect(empty).toMatchObject({ kind: "empty", message: "No output" });

    const running = model(
      part({
        kind: "execute",
        status: "running",
        params: { type: "execute", command: "", background: false },
      }),
    );
    expect(running).toMatchObject({ kind: "empty", message: "Processing..." });

    const blankError = part({
      kind: "execute",
      status: "completed",
      params: { type: "execute", command: "", background: false },
      result: { type: "error", message: "" },
    });
    expect(model(blankError)).toMatchObject({ kind: "empty", message: "No output" });
    const fields = mod.executeTerminalFields as (value: AgentToolCallPart) => { failed: boolean };
    expect(fields(blankError).failed).toBe(true);

    const echo = part({
      name: "`ls`",
      title: "Execute `ls`",
      kind: "execute",
      params: { type: "execute", command: "ls", background: false },
      result: { type: "execute", output: "a.ts" },
    });
    expect(chrome(echo, present(echo)).title).toBe("Run Script");

    const named = part({
      name: "run_terminal_command",
      title: "Typecheck files-related web sources",
      kind: "execute",
      params: { type: "execute", command: "cd apps/web && bunx tsc --noEmit", background: false },
    });
    expect(chrome(named, present(named)).title).toBe("Typecheck files-related web sources");

    expect(mod.TOOL_TEXT_PREVIEW_LIMIT).toBe(160);
    const usesPreview = mod.toolTextUsesPreview as (text: string) => boolean;
    expect(usesPreview("hello")).toBe(false);
    expect(usesPreview("a\nb")).toBe(true);
    expect(usesPreview("x".repeat(160))).toBe(false);
    expect(usesPreview("x".repeat(161))).toBe(true);
    expect(mod.TOOL_COMMAND_MAX_HEIGHT).toBe(224);
    expect(mod.EXECUTE_MENU_INSET).toBe(6);
    expect(mod.EXECUTE_MENU_BUTTON).toBe(24);
    expect(mod.EXECUTE_MENU_ICON).toBe(14);
    expect(mod.EXECUTE_MENU_RADIUS).toBe(8);
    expect(mod.EXECUTE_MENU_MIN_WIDTH).toBe(160);
    expect(mod.EXECUTE_COMMAND_PAD_RIGHT).toBe(36);
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-body.tsx"),
      "utf8",
    );
    const view = source.slice(source.indexOf("// @view"));
    const terminal = view.slice(
      view.indexOf("function ExecuteTerminal"),
      view.indexOf("function CappedMono"),
    );
    expect(terminal).toContain("TOOL_COMMAND_MAX_HEIGHT");
    expect(terminal).toContain("TOOL_CODE_MAX_HEIGHT");
    expect(terminal).toContain("$ ");
    expect(terminal).toContain('fontFamily: "Menlo"');
    expect(terminal).toContain("fontSize: 13");
    expect(terminal).toContain("paddingHorizontal: 12");
    expect(terminal).toContain("paddingLeft: 12");
    expect(terminal).toContain("paddingRight: EXECUTE_COMMAND_PAD_RIGHT");
    expect(terminal).toContain("<ExecuteCopyMenu");
    const menu = view.slice(
      view.indexOf("function ExecuteCopyMenu"),
      view.indexOf("function ExecuteTerminal"),
    );
    expect(menu).toContain("copy.terminalMore");
    expect(menu).toContain("copy.copyCommand");
    expect(menu).toContain("copy.copyResult");
    expect(menu).toContain("MoreHorizontalIcon");
    expect(menu).toContain("EXECUTE_MENU_INSET");
    expect(menu).toContain("EXECUTE_MENU_BUTTON");
    expect(menu).toContain("EXECUTE_MENU_ICON");
    expect(menu).toContain("EXECUTE_MENU_MIN_WIDTH");
    expect(menu).toContain("Clipboard.setStringAsync");
    expect(menu).toContain("trimEnd()");
    expect(menu).toContain("command.length > 0");
    expect(menu).toContain("output.length > 0");
    expect(terminal).toContain("paddingTop: 10");
    expect(terminal).toContain("paddingBottom: output ? 0 : 10");
    expect(terminal).toContain("paddingTop: command ? 4 : 10");
    expect(terminal).toContain("paddingBottom: 10");
    expect(terminal).toContain("terminalAnsiPieces(output)");
    expect(terminal).toContain("chatDestructiveColor(theme.isDark)");
    expect(terminal).toContain("chatForeground(theme.isDark)");
    expect(terminal).toContain("chatMutedForeground(theme.isDark)");
    expect(terminal).not.toContain("theme.colors.red");
    expect(terminal).not.toContain("AgentChatMarkdown");
    const trigger = source.slice(source.indexOf("export function ToolCallRow"));
    expect(trigger).toContain("executeTerminalFields(part).failed");
    expect(trigger).toContain("chatDestructiveColor(theme.isDark)");
    expect(trigger).toContain("const titleColor = failed ? failedColor : muted");
    expect(trigger).toContain("const muted = chatMutedForeground(theme.isDark)");
    expect(trigger).toContain("<ToolKindIcon color={muted} kind={part.kind}");
    expect(trigger).toContain("<ExpandChevron color={muted} open={open}");
    expect(trigger).toContain("<XCircleIcon color={failedColor}");
    expect(trigger).not.toContain("theme.colors.red");
  });
});

describe("move and delete bodies", () => {
  test("labels a delete with the stored path and draws a move arrow", async () => {
    const mod = await importPure("tool-body.tsx");
    const label = mod.deletedFileLabel as (path: string) => string;
    expect(label("gone.ts")).toBe("Deleted gone.ts");
    expect(label("src/a ts")).toBe("Deleted src/a ts");

    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-body.tsx"),
      "utf8",
    );
    const body = source.slice(source.indexOf("// @view"));
    const move = body.slice(body.indexOf('case "move":'), body.indexOf('case "delete":'));
    expect(move).toContain("ArrowRightIcon");
    expect(move).toContain("copy.moveTo");
    expect(move).toContain("paddingHorizontal: 12");
    expect(move).toContain("paddingVertical: 8");
    expect(move).not.toContain("→");
    const deleted = body.slice(body.indexOf('case "delete":'), body.indexOf('case "error":'));
    expect(deleted).toContain("deletedFileLabel");
    expect(deleted).toContain("paddingHorizontal: 12");
    expect(deleted).toContain("paddingVertical: 8");
    expect(deleted).not.toContain("PathChip");
    const todos = body.slice(
      body.indexOf("function TodoStatusRows"),
      body.indexOf("function ImageGenMark"),
    );
    expect(todos).toContain("paddingHorizontal: 12");
    expect(todos).toContain("paddingVertical: 8");
    expect(todos).toContain("TOOL_ADDITION_COLOR");
    expect(todos).not.toContain("theme.colors.green");
  });
});

describe("image generation", () => {
  test("uses the web status words, aspect, and stays open while the tool is active", async () => {
    const mod = await importPure("tool-body.tsx");
    const model = mod.toolBodyModel as (value: AgentToolCallPart) => {
      kind: string;
      title: string;
      prompt: string;
      path: string | null;
      aspect: number;
      status: string;
      items: Array<{ uri?: string; path?: string }>;
    };
    const status = mod.imageGenStatus as (value: AgentToolCallPart) => string;
    const aspect = mod.imageGenAspectRatio as (ratio: string | null | undefined) => number;
    const staysOpen = mod.imageGenStaysOpen as (value: string | null | undefined) => boolean;
    const labels = mod.IMAGE_GEN_STATUS_TEXT as Record<string, string>;
    const chrome = mod.toolRowChrome as (
      value: AgentToolCallPart,
      parsed: unknown,
    ) => { title: string; fileName: string | null; lineRange: string | null };

    expect(aspect("16:9")).toBeCloseTo(16 / 9);
    expect(aspect("3 / 2")).toBe(1.5);
    expect(aspect("auto")).toBe(1);
    expect(aspect(null)).toBe(1);
    expect(staysOpen("pending")).toBe(true);
    expect(staysOpen("running")).toBe(true);
    expect(staysOpen("completed")).toBe(false);

    const queued = part({
      kind: "image_gen",
      name: "",
      title: "",
      status: "pending",
      params: { type: "image_gen", prompt: "a glass mark", aspect_ratio: "16:9" },
    });
    expect(model(queued)).toMatchObject({
      kind: "image_gen",
      title: "Image",
      prompt: "a glass mark",
      path: null,
      status: "queued",
      items: [],
    });
    expect(model(queued).aspect).toBeCloseTo(16 / 9);
    expect(status(queued)).toBe("queued");
    expect(chrome(queued, {})).toEqual({ title: "Image", fileName: null, lineRange: null });

    const failed = part({
      kind: "image_gen",
      status: "failed",
      params: { type: "image_gen", prompt: "cat", path: "out.png" },
      result: { type: "error", message: "nope" },
    });
    expect(model(failed).status).toBe("error");
    expect(labels).toEqual({
      queued: "Waiting to generate",
      generating: "Generating image",
      refining: "Refining details",
      complete: "Image ready",
      error: "Generation failed",
    });

    const data = part({
      kind: "image_gen",
      params: { type: "image_gen", prompt: "cat" },
      result: { type: "images", images: [{ url: "data:image/png;base64,aaaa" }] },
    });
    expect(model(data).items).toEqual([{ uri: "data:image/png;base64,aaaa" }]);

    const saved = part({
      kind: "image_gen",
      name: "Generate",
      title: "Mark",
      params: { type: "image_gen", prompt: "cat", path: "shots/out.png" },
    });
    expect(chrome(saved, {})).toEqual({ title: "Mark", fileName: "out.png", lineRange: null });

    const web = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../../../packages/ui/src/components/ui/image-generation.tsx",
      ),
      "utf8",
    );
    expect(web).toContain('queued: "Waiting to generate"');
    expect(web).toContain('generating: "Generating image"');
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-body.tsx"),
      "utf8",
    );
    const view = source.slice(source.indexOf("function ImageGenBody"));
    const card = view.slice(0, view.indexOf("function PlanDocumentBody"));
    expect(card).toContain("maxWidth: 208");
    expect(card).toContain("paddingHorizontal: 8");
    expect(card).toContain("paddingBottom: 8");
    expect(card).toContain("IMAGE_GEN_STATUS_TEXT");
    expect(card).toContain("IMAGE_GEN_RADIUS");
    expect(card).toContain("TOOL_FILE_CHIP_LIGHT");
    expect(card).toContain("TOOL_FILE_CHIP_DARK");
    expect(card).not.toContain("theme.colors.cardSubtle");
    expect(card).not.toContain("borderRadius: 12");
    expect(card).not.toContain("DitherField");
    const preview = source.slice(
      source.indexOf("function ImageGenPreview"),
      source.indexOf("function ImageGenBody"),
    );
    expect(preview).toContain("IMAGE_GEN_RADIUS");
    expect(mod.IMAGE_GEN_RADIUS).toBe(14);
    expect(source).toContain("imageGenStaysOpen(part.status)");
    expect(source).toContain("if (imageActive && open) return;");
  });
});

describe("plan document", () => {
  test("keeps the name, overview, markdown, and to-dos, and opens when any exist", async () => {
    const mod = await importPure("tool-body.tsx");
    const model = mod.toolBodyModel as (value: AgentToolCallPart) => {
      kind: string;
      title: string;
      overview: string | null;
      plan: string;
      todos: Array<{ content: string; status: string }>;
    };
    const startsOpen = mod.planDocumentStartsOpen as (value: {
      plan: string;
      todos: readonly unknown[];
    }) => boolean;
    const label = mod.planPaneSwitchLabel as (showing: "body" | "todos", count: number) => string;
    const chrome = mod.toolRowChrome as (
      value: AgentToolCallPart,
      parsed: unknown,
    ) => { title: string; fileName: string | null };

    const named = part({
      kind: "plan_document",
      name: "createPlan",
      title: "Old title",
      params: {
        type: "plan_document",
        name: "Refactor",
        overview: "  Tighten layout  ",
        plan: "  # Refactor\n\nDo the work.  ",
        todos: [
          { content: "Inspect", status: "completed" },
          { content: "   ", status: "pending" },
          { content: "Ship", status: "in-progress" },
        ],
      },
    });
    const body = model(named);
    expect(body).toMatchObject({
      kind: "plan_document",
      title: "Refactor",
      overview: "Tighten layout",
      plan: "# Refactor\n\nDo the work.",
    });
    expect(body.todos).toEqual([
      { content: "Inspect", status: "completed" },
      { content: "Ship", status: "in_progress" },
    ]);
    expect(startsOpen(body)).toBe(true);
    expect(startsOpen({ plan: "", todos: [] })).toBe(false);
    expect(startsOpen({ plan: "", todos: [{ content: "Ship" }] })).toBe(true);
    expect(label("body", 1)).toBe("1 to-do");
    expect(label("body", 2)).toBe("2 to-dos");
    expect(label("todos", 2)).toBe("View plan");
    expect(chrome(named, {})).toEqual({ title: "Refactor", fileName: null, lineRange: null });

    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-body.tsx"),
      "utf8",
    );
    const view = source.slice(source.indexOf("function PlanDocumentBody"));
    const card = view.slice(0, view.indexOf("function ToolBodyView"));
    expect(card).toContain("AgentChatMarkdown");
    expect(card).toContain('prose="plan"');
    expect(card).toContain("TodoStatusRows");
    expect(card).toContain("copy.noOutput");
    expect(card).toContain("paddingTop: 8");
    expect(card).not.toContain("gap: 8");
    expect(card).not.toContain("planPaneSwitchLabel");
    expect(source).toContain("planDocumentStartsOpen(model)");
    const row = source.slice(source.indexOf("export function ToolCallRow"));
    expect(row).toContain('part.kind === "plan_document"');
    expect(row).toContain("<ScrollTextIcon");
    expect(row).toContain("planPaneSwitchLabel");
    expect(row).toContain("<ListTodoIcon");
    expect(row).toContain("paddingHorizontal: 6");
    expect(row).toContain("paddingVertical: 2");
    expect(row).toContain("borderRadius: 8");
    expect(row).toContain("gap: planCanSwitch ? 4 : 0");
    const kindIcon = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-kind-icon.tsx"),
      "utf8",
    );
    const planKind = kindIcon.slice(
      kindIcon.indexOf('case "plan_document":'),
      kindIcon.indexOf('case "edit":'),
    );
    expect(planKind).toContain("FileTextIcon");
  });
});

describe("todo status", () => {
  test("matches the web icon branches and labels", async () => {
    const mod = await importPure("tool-body.tsx");
    const kind = mod.todoStatusKind as (status: string) => string;
    const label = mod.todoStatusLabel as (kind: string) => string;
    expect(kind("completed")).toBe("completed");
    expect(kind("in-progress")).toBe("in_progress");
    expect(kind("in_progress")).toBe("in_progress");
    expect(kind("pending")).toBe("pending");
    expect(kind("later")).toBe("pending");
    expect(label("completed")).toBe("Completed");
    expect(label("in_progress")).toBe("In progress");
    expect(label("pending")).toBe("Pending");
  });
});

describe("search hit groups", () => {
  test("groups by path, drops the shared directory, and counts like web", async () => {
    const mod = await importPure("tool-body.tsx");
    const group = mod.groupSearchHits as (
      hits: Array<{ path: string; line?: number; text: string }>,
    ) => Array<{
      path: string;
      shown: string;
      hits: Array<{ line?: number; text: string }>;
    }>;
    const count = mod.searchMatchCount as (
      hits: number,
      summary: string | undefined,
    ) => number | null;
    const label = mod.searchMatchLabel as (count: number | null) => string | null;
    expect(
      group([
        { path: "src/app/a.ts", line: 1, text: "a" },
        { path: "src/app/a.ts", line: 2, text: "b" },
        { path: "src/app/b.ts", text: "c" },
      ]),
    ).toEqual([
      {
        path: "src/app/a.ts",
        shown: "a.ts",
        hits: [
          { line: 1, text: "a" },
          { line: 2, text: "b" },
        ],
      },
      { path: "src/app/b.ts", shown: "b.ts", hits: [{ text: "c" }] },
    ]);
    expect(count(2, "found 9 matches")).toBe(2);
    expect(count(0, "found 3 matches")).toBe(3);
    expect(count(0, "no matches")).toBe(0);
    expect(count(0, "nothing here")).toBeNull();
    expect(label(1)).toBe("1 match");
    expect(label(0)).toBe("0 matches");
    expect(label(null)).toBeNull();

    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-body.tsx"),
      "utf8",
    );
    const view = source.slice(source.indexOf("// @view"));
    const hits = view.slice(
      view.indexOf("function SearchHitsBody"),
      view.indexOf("function PathGlyph"),
    );
    expect(hits).toContain("TOOL_FILE_LIST_MAX_HEIGHT");
    expect(hits).toContain("HeightClip");
    expect(hits).toContain("<PathGlyph");
    expect(hits).toContain("pathLooksLikeDirectory(group.path)");
    expect(hits).not.toContain("PathChip");
    expect(hits).toContain("toolTextUsesPreview(model.summary)");
    expect(hits).toContain("<ToolPlainPreview");
    expect(hits).toContain("paddingTop: 10");
    expect(hits).not.toContain("BODY_TEXT");
    expect(hits.indexOf("$ ")).toBeLessThan(hits.indexOf("HeightClip"));
  });
});

describe("tool row chrome", () => {
  test("uses the kind verb and a filename chip when the wire title is a path", async () => {
    const mod = await importPure("tool-body.tsx");
    const present = (await import("@atmos/agent-transcript")).presentAgentTool;
    const chrome = mod.toolRowChrome as (
      part: AgentToolCallPart,
      parsed: ReturnType<typeof present>,
    ) => { title: string; fileName: string | null; lineRange: string | null };

    const read = part({
      kind: "read",
      name: "Read",
      title: "src/theme.ts",
      status: "running",
      params: { type: "read", path: "src/theme.ts" },
    });
    expect(chrome(read, present(read))).toEqual({
      title: "Read",
      fileName: "theme.ts",
      lineRange: null,
    });

    const ranged = part({
      kind: "read",
      name: "Read",
      title: "src/theme.ts",
      params: { type: "read", path: "src/theme.ts", offset: 10, limit: 4 },
    });
    expect(chrome(ranged, present(ranged)).lineRange).toBe("(10-13)");

    const search = part({
      kind: "search",
      name: "Search",
      title: "ready",
      status: "running",
      params: { type: "search", query: "ready" },
    });
    expect(chrome(search, present(search))).toEqual({
      title: "Search",
      fileName: null,
      lineRange: null,
    });

    const web = part({
      kind: "web_search",
      name: "Search",
      title: "atmos",
      params: { type: "web_search", query: "atmos" },
      result: {
        type: "web_search",
        query: "atmos",
        links: [{ url: "https://atmos.dev", title: "Atmos" }],
      },
    });
    expect(chrome(web, present(web))).toEqual({
      title: "Searching for atmos",
      fileName: null,
      lineRange: null,
    });

    const fetched = part({
      kind: "fetch",
      name: "Fetch",
      title: "https://www.example.com/docs",
      params: { type: "fetch", url: "https://www.example.com/docs" },
      result: { type: "web_fetch", url: "https://www.example.com/docs", markdown: "# Docs" },
    });
    expect(chrome(fetched, present(fetched))).toEqual({
      title: "Fetch www.example.com",
      fileName: null,
      lineRange: null,
    });

    const failedFetch = part({
      kind: "fetch",
      status: "failed",
      params: { type: "fetch", url: "https://atmos.dev/x" },
      result: { type: "error", message: "nope" },
    });
    expect(chrome(failedFetch, present(failedFetch)).title).toBe("Fetch atmos.dev");

    const patch = part({
      kind: "edit",
      title: "Patch a.ts",
      params: { type: "edit", path: "a.ts" },
      result: { type: "text", text: "--- a/a.ts\n+++ b/a.ts\n" },
    });
    expect(chrome(patch, present(patch))).toEqual({
      title: "Patch",
      fileName: "a.ts",
      lineRange: null,
    });

    const written = part({
      kind: "edit",
      name: "Write",
      title: "src/hello.ts",
      params: { type: "edit", path: "src/hello.ts" },
      result: {
        type: "diff",
        path: "src/hello.ts",
        old_content: "",
        new_content: "export const n = 1;\n",
      },
    });
    expect(chrome(written, present(written))).toEqual({
      title: "Created",
      fileName: "hello.ts",
      lineRange: null,
    });

    const edited = part({
      kind: "edit",
      name: "Edit",
      title: "src/hello.ts",
      params: { type: "edit", path: "src/hello.ts" },
      result: { type: "diff", path: "src/hello.ts", old_content: "a\n", new_content: "b\n" },
    });
    expect(chrome(edited, present(edited)).title).toBe("Edit");

    const blankWrite = part({
      kind: "edit",
      name: "Write",
      title: "src/empty.ts",
      params: { type: "edit", path: "src/empty.ts" },
      result: { type: "diff", path: "src/empty.ts", old_content: "", new_content: "" },
    });
    expect(chrome(blankWrite, present(blankWrite)).title).toBe("Edit");
  });

  test("a new or deleted code preview keeps the 11px word and the line count", async () => {
    const mod = await importPure("tool-body.tsx");
    const present = (await import("@atmos/agent-transcript")).presentAgentTool;
    const chrome = mod.toolRowChrome as (
      part: AgentToolCallPart,
      parsed: ReturnType<typeof present>,
    ) => { title: string };
    const created = mod.diffIsCreatedFile as (
      presentation: ReturnType<typeof present>["presentation"],
    ) => boolean;
    const meta = mod.codePreviewMeta as (
      hint: "new" | "deleted" | null | undefined,
    ) => string | null;
    const row = mod.toolRowDiffStats as (model: Body) => { additions: number; deletions: number };

    expect(
      created({ kind: "diff", files: [{ path: "a.ts", oldContent: "", newContent: "x" }] }),
    ).toBe(true);
    expect(
      created({ kind: "diff", files: [{ path: "a.ts", oldContent: " ", newContent: "x" }] }),
    ).toBe(false);
    expect(created({ kind: "diff", files: [] })).toBe(false);
    expect(meta("new")).toBe("New");
    expect(meta("deleted")).toBe("Deleted");
    expect(meta(null)).toBeNull();
    expect(meta(undefined)).toBeNull();
    expect(
      row({ kind: "code", title: "Created", path: "a.ts", text: "a\nb\n", hint: "new" }),
    ).toEqual({ additions: 2, deletions: 0 });
    expect(
      row({ kind: "code", title: "Remove", path: "a.ts", text: "a\nb\n", hint: "deleted" }),
    ).toEqual({ additions: 0, deletions: 2 });
    expect(row({ kind: "code", title: "Read", path: "a.ts", text: "a\nb\n", hint: null })).toEqual({
      additions: 0,
      deletions: 0,
    });
    expect(row({ kind: "code", title: "Created", path: "a.ts", text: "", hint: "new" })).toEqual({
      additions: 0,
      deletions: 0,
    });

    const file = part({
      kind: "edit",
      name: "Write",
      title: "src/new.ts",
      params: { type: "edit", path: "src/new.ts" },
      result: { type: "file_content", path: "src/new.ts", text: "export const n = 1;\n" },
    });
    const parsed = present(file);
    if (parsed.presentation.kind !== "code") throw new Error("expected a code preview");
    expect(chrome(file, parsed).title).not.toBe("Created");
    expect(
      chrome(file, { ...parsed, presentation: { ...parsed.presentation, hint: "new" } }).title,
    ).toBe("Created");
    expect(
      chrome(file, { ...parsed, presentation: { ...parsed.presentation, hint: "deleted" } }).title,
    ).not.toBe("Created");

    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-body.tsx"),
      "utf8",
    );
    const trigger = source.slice(source.indexOf("export function ToolCallRow"));
    expect(trigger).toContain("codePreviewMeta");
    expect(trigger).toContain("fontSize: 11");

    const fence = mod.fenceForMarkdown as (code: string, language: string) => string;
    expect(mod.TOOL_CODE_MAX_HEIGHT).toBe(384);
    expect(fence("const a = 1;\n", "typescript")).toBe("```typescript\nconst a = 1;\n\n```");
    expect(fence("```\n", "md")).toBe("````md\n```\n\n````");
    expect(fence("plain", "")).toBe("```\nplain\n```");
    const view = source.slice(source.indexOf("// @view"));
    const codeFence = view.slice(
      view.indexOf("function ToolCodeFence"),
      view.indexOf("function HeightClip"),
    );
    expect(codeFence).toContain("AgentChatMarkdown");
    expect(codeFence).toContain("fenceForMarkdown");
    expect(codeFence).toContain("TOOL_CODE_MAX_HEIGHT");
    expect(codeFence).toContain("codeBlockMargin={8}");
    expect(codeFence).toContain("codeBlockMaxHeight={0}");
    expect(codeFence).toContain("codeBlockLineStart={lineStart}");
    expect(view).toContain("lineStart={model.lineStart}");
    expect(codeFence).toContain("paddingHorizontal: 8");
    expect(codeFence).toContain("paddingBottom: 8");
    expect(codeFence).toContain("CodeExpandButton");
    expect(codeFence).toContain("CODE_FENCE_EXPAND_TOP");
    expect(codeFence).toContain("CODE_FENCE_EXPAND_RIGHT");
    expect(codeFence).not.toContain("ShowMoreButton");
    expect(codeFence).not.toContain("PathChip");
    expect(codeFence).not.toContain("CappedMono");
    const clip = view.slice(
      view.indexOf("function HeightClip"),
      view.indexOf("function ExecuteTerminal"),
    );
    expect(clip).toContain("ScrollView");
    expect(clip).toContain("nestedScrollEnabled");
    expect(clip).toContain("onContentSizeChange");
    expect(clip).toContain("scrollEnabled={contentHeight > maxHeight}");
    expect(clip).not.toContain("ShowMoreButton");
    expect(clip).not.toContain('overflow: "hidden"');
    expect(mod.CODE_EXPAND_ICON).toBe(14);
    expect(mod.CODE_EXPAND_LIGHT).toBe("#52525b");
    expect(mod.CODE_EXPAND_DARK).toBe("#a3a3a3");
    expect(mod.CODE_FENCE_EXPAND_TOP).toBe(11);
    expect(mod.CODE_FENCE_EXPAND_RIGHT).toBe(30);
    expect(mod.CODE_PREVIEW_EXPAND_TOP).toBe(6);
    expect(mod.CODE_PREVIEW_EXPAND_RIGHT).toBe(8);
    const expandColor = mod.codeExpandColor as (isDark: boolean) => string;
    expect(expandColor(false)).toBe("#52525b");
    expect(expandColor(true)).toBe("#a3a3a3");
  });
});

describe("tool body panel", () => {
  test("matches the web muted panel kinds", async () => {
    const mod = await importPure("tool-body.tsx");
    const panel = mod.toolBodyUsesPanel as (
      model: { kind: string; language?: string; format?: string; path?: string | null },
      partKind: string,
    ) => boolean;
    expect(mod.TOOL_PANEL_RADIUS).toBe(8);
    expect(mod.TOOL_PANEL_LIGHT).toBe("rgba(222, 222, 224, 0.5)");
    expect(mod.TOOL_PANEL_DARK).toBe("rgba(39, 39, 42, 0.5)");
    for (const kind of ["search", "files", "tree", "prose", "move", "delete", "error", "images"]) {
      expect(panel({ kind }, "read")).toBe(true);
    }
    expect(panel({ kind: "empty", path: null }, "read")).toBe(true);
    expect(panel({ kind: "empty", path: "note.md" }, "read")).toBe(true);
    expect(panel({ kind: "empty", path: "shot.png" }, "read")).toBe(false);
    expect(panel({ kind: "preview", language: "plaintext" }, "read")).toBe(true);
    expect(panel({ kind: "preview", language: "json" }, "read")).toBe(false);
    expect(panel({ kind: "preview", language: "json" }, "other")).toBe(true);
    expect(panel({ kind: "empty", path: "shot.png" }, "execute")).toBe(true);
    expect(panel({ kind: "web_fetch", format: "text" }, "fetch")).toBe(true);
    expect(panel({ kind: "web_fetch", format: "error" }, "fetch")).toBe(true);
    expect(panel({ kind: "web_fetch", format: "markdown" }, "fetch")).toBe(false);
    for (const kind of [
      "code",
      "markdown",
      "diff",
      "diff_stats",
      "patch",
      "web_search",
      "plan_document",
      "image_gen",
    ]) {
      expect(panel({ kind }, "read")).toBe(false);
    }

    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-body.tsx"),
      "utf8",
    );
    const row = source.slice(source.indexOf("export function ToolCallRow"));
    expect(row).toContain("toolBodyUsesPanel(model, part.kind)");
    expect(row).toContain("TOOL_PANEL_RADIUS");
    expect(row).toContain('overflow: "hidden"');
    expect(row).toContain("marginTop: metrics.bodyPadTop");
    expect(row).toContain("paddingTop: metrics.bodyPadTop");
  });
});

describe("tool file chip", () => {
  test("uses the web muted filename chip", async () => {
    const mod = await importPure("tool-body.tsx");
    expect(mod.TOOL_FILE_CHIP_LIGHT).toBe("#dedee0");
    expect(mod.TOOL_FILE_CHIP_DARK).toBe("#27272a");
    expect(mod.TOOL_FILE_CHIP_RADIUS).toBe(8);

    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "tool-body.tsx"),
      "utf8",
    );
    const view = source.slice(source.indexOf("// @view"));
    const chip = view.slice(
      view.indexOf("function ToolFileChip"),
      view.indexOf("export function ToolCallRow"),
    );
    expect(chip).toContain("TOOL_FILE_CHIP_LIGHT");
    expect(chip).toContain("TOOL_FILE_CHIP_DARK");
    expect(chip).toContain("TOOL_FILE_CHIP_RADIUS");
    expect(chip).toContain('maxWidth: "46%"');
    expect(chip).toContain("FileTextIcon");
    expect(chip).toContain("chatForeground(theme.isDark)");
    expect(chip).toContain("chatMutedForeground(theme.isDark)");
    expect(chip).toContain("paddingHorizontal: 6");
    expect(chip).toContain("paddingVertical: 2");
    expect(chip).toContain("gap: 4");
    expect(chip).not.toContain("theme.colors.cardSubtle");
    expect(chip).not.toContain("borderRadius: 6");
    expect(chip).not.toContain("PathChip");
  });
});
