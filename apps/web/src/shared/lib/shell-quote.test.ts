import { describe, expect, it } from "bun:test";

import { shellQuote } from "./shell-quote";

describe("shellQuote", () => {
  it("returns simple safe strings unquoted", () => {
    expect(shellQuote("plain-arg_1.0")).toBe("plain-arg_1.0");
  });

  it("single-quotes strings with spaces and specials", () => {
    expect(shellQuote("hello world $HOME")).toBe("'hello world $HOME'");
  });

  it("escapes embedded single quotes", () => {
    expect(shellQuote("it's here")).toBe("'it'\\''s here'");
  });

  it("uses ANSI-C quoting for multiline strings so the command stays single-line", () => {
    const quoted = shellQuote("line1\nline2");
    expect(quoted).toBe("$'line1\\nline2'");
    expect(quoted).not.toContain("\n");
  });

  it("keeps CRLF, tabs, backslashes and quotes single-line and escaped", () => {
    const quoted = shellQuote("a\r\nb\tc\\d'e");
    expect(quoted).toBe("$'a\\nb\\tc\\\\d\\'e'");
    expect(quoted).not.toMatch(/[\r\n]/);
  });
});
