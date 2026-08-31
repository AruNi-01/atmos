import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const here = dirname(fileURLToPath(import.meta.url));

describe("streamdown plain tables", () => {
  test("text and thinking markdown tables skip streamdown toolbar chrome", () => {
    const table = readFileSync(join(here, "streamdown-table.tsx"), "utf8");
    expect(table).toContain("overflow-hidden");
    expect(table).toContain("table-fixed");
    expect(table).toContain("whitespace-normal");
    expect(table).toContain("[overflow-wrap:anywhere]");
    expect(table).not.toContain("overflow-x-auto");
    expect(table).not.toContain("min-w-max");
    expect(table).not.toContain("TableCopyDropdown");
    expect(table).not.toContain("bg-sidebar");
    expect(table).not.toContain("viewFullscreen");

    const message = readFileSync(join(here, "message.tsx"), "utf8");
    expect(message).toContain("streamdownPlainTableComponents");

    const reasoning = readFileSync(join(here, "reasoning.tsx"), "utf8");
    expect(reasoning).toContain("MessageResponse");
    expect(reasoning).toContain("parseIncompleteMarkdown");
    expect(reasoning).not.toContain("streamdownPlainTableComponents");
  });
});
