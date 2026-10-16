// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { agentChatMarkdownChrome } from "./markdown-chrome";

describe("agent chat markdown chrome", () => {
  test("uses zinc table and inline-code colors instead of the library defaults", () => {
    const light = agentChatMarkdownChrome(false);
    const dark = agentChatMarkdownChrome(true);

    expect(light.codeBackground).toBe("#f4f4f5");
    expect(light.codeText).toBe("#27272a");
    expect(light.headerBackground).toBe("#f4f4f5");
    expect(light.row).toBe("#f4f4f6");
    expect(dark.codeBackground).toBe("#27272a");
    expect(dark.codeText).toBe("#e4e4e7");
    expect(dark.row).not.toBe("#ffffff");
    expect(dark.headerBackground).toBe("#27272a");
    expect(dark.bodyText).toBe("#a1a1aa");
  });
});
