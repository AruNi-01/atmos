import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const here = dirname(fileURLToPath(import.meta.url));

describe("streamdown plain tables", () => {
  test("text and thinking markdown tables reuse the shared preview table chrome", () => {
    const table = readFileSync(join(here, "streamdown-table.tsx"), "utf8");
    expect(table).toContain("MARKDOWN_TABLE_WRAP_CLASS");
    expect(table).toContain("MARKDOWN_TABLE_CLASS");
    expect(table).toContain("MARKDOWN_TABLE_HEAD_CLASS");
    expect(table).toContain("MARKDOWN_TABLE_TH_CLASS");
    expect(table).toContain("MARKDOWN_TABLE_TD_CLASS");
    expect(table).toContain("thead: StreamdownPlainThead");
    expect(table).toContain("tbody: StreamdownPlainTbody");
    expect(table).not.toContain("TableCopyDropdown");
    expect(table).not.toContain("bg-sidebar");
    expect(table).not.toContain("viewFullscreen");
    expect(table).not.toContain("whitespace-nowrap");
    expect(table).not.toContain("w-max");

    const shared = readFileSync(join(here, "../../lib/markdown-table.ts"), "utf8");
    expect(shared).toContain("atmos-markdown-table");
    expect(shared).toContain("px-4 py-2.5");
    expect(shared).toContain("table-fixed");
    expect(shared).toContain("overflow-hidden");

    const message = readFileSync(join(here, "message.tsx"), "utf8");
    expect(message).toContain("streamdownPlainTableComponents");
    expect(message).not.toContain("ml-auto");
    expect(message).not.toContain("max-w-[95%]");
    expect(message).toContain("group-[.is-user]:bg-secondary");

    const reasoning = readFileSync(join(here, "reasoning.tsx"), "utf8");
    expect(reasoning).toContain("MessageResponse");
    expect(reasoning).toContain("parseIncompleteMarkdown");
    expect(reasoning).toContain("linkSafety={linkSafety}");
    expect(reasoning).not.toContain("streamdownPlainTableComponents");
  });
});
