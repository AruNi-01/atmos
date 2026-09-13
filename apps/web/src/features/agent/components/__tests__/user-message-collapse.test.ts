import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "../UserMessageBody.tsx"), "utf8");

describe("user message collapse fade", () => {
  it("clips overflow below three lines and dusts out the fourth", () => {
    expect(source).toContain("USER_MESSAGE_COLLAPSE_LINES");
    expect(source).toContain("USER_MESSAGE_COLLAPSE_FADE_LINES");
    expect(source).toContain("data-user-message-fade");
    expect(source).toContain("maskImage");
    expect(source).toContain("WebkitMaskImage");
    expect(source).toContain("linear-gradient(to bottom");
    expect(source).toContain("h-[1lh]");
    expect(source).toContain("from-secondary/0 to-secondary");
    expect(source).not.toContain("backdrop-blur");
    expect(source).toContain("maxHeight");
    expect(source).not.toContain("collapsedUserMessageText");
  });
});
