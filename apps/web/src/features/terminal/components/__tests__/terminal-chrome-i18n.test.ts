import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const chrome = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../TerminalChrome.tsx"),
  "utf8",
);

describe("TerminalChrome i18n", () => {
  test("status and search copy come from Terminal.chrome translations", () => {
    expect(chrome).toContain('useTranslations("Terminal.chrome")');
    expect(chrome).toContain('t("status.connecting")');
    expect(chrome).toContain('t("status.reconnecting")');
    expect(chrome).toContain('t("status.disconnected")');
    expect(chrome).toContain('t("search.placeholder")');
    expect(chrome).not.toContain("Connecting to terminal...");
    expect(chrome).not.toContain("Reconnecting...");
    expect(chrome).not.toContain('"Disconnected"');
    expect(chrome).not.toContain("Search terminal");
  });
});
