import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(import.meta.dir, "../AgentChatScrollToBottom.tsx"),
  "utf8",
);
const en = readFileSync(
  join(import.meta.dir, "../../../../../messages/en.json"),
  "utf8",
);
const zh = readFileSync(
  join(import.meta.dir, "../../../../../messages/zh.json"),
  "utf8",
);

describe("agent chat scroll-to-bottom copy", () => {
  it("renders the below count with SlidingNumber and TextMorph pluralization", () => {
    expect(source).toContain("SlidingNumber");
    expect(source).toContain("<SlidingNumber value={count} />");
    expect(source).toContain("TextMorph");
    expect(source).toContain('t("unit", { count })');
    expect(source).toContain('t("scrollBelow.aria", { count })');
    expect(source).toContain('data-agent-chat-scroll-below=""');
    expect(source).toContain("<ChevronDown");
    expect(source).not.toContain("ActionSwapCascadeText");
  });

  it("keeps English plural copy and Chinese count phrasing", () => {
    expect(en).toContain(
      '"unit": "{count, plural, one {message} other {messages}}"',
    );
    expect(en).toContain('"suffix": "below"');
    expect(en).toContain(
      '"aria": "{count, plural, one {# message below} other {# messages below}}"',
    );
    expect(zh).toContain('"prefix": "下面有"');
    expect(zh).toContain('"suffix": "条消息"');
    expect(zh).toContain('"aria": "下面有 {count} 条消息"');
  });
});
