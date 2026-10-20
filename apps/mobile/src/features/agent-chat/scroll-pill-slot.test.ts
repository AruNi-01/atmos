// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { SCROLL_PILL_SLOT_GAP, SCROLL_PILL_SLOT_MS, scrollPillSlotWidth } from "./scroll-pill-slot";

const dir = dirname(fileURLToPath(import.meta.url));

describe("scroll pill slot", () => {
  test("keeps the gap inside the pinned width and hides a closed pill", () => {
    expect(SCROLL_PILL_SLOT_MS).toBe(180);
    expect(SCROLL_PILL_SLOT_GAP).toBe(8);
    expect(scrollPillSlotWidth(0)).toBe(0);
    expect(scrollPillSlotWidth(72)).toBe(80);
  });

  test("pins the scroll pill in the glass row and keeps the measured row height", () => {
    const row = readFileSync(join(dir, "composer-pill-row.tsx"), "utf8");
    const thread = readFileSync(join(dir, "AgentChatThreadScreen.tsx"), "utf8");
    const preview = readFileSync(join(dir, "preview-chat-screen.tsx"), "utf8");
    expect(row).toContain("styles.rowWithScroll");
    expect(row).toContain("measureInWindow");
    expect(row).toContain('testID="agent-chat-card-pill-scroller"');
    expect(thread).toContain("const pillRowHeight = measuredPillRowHeight;");
    expect(thread).not.toContain("resolvedPillRowHeight");
    expect(preview).toContain("const pillRowHeight = pillHeight;");
    expect(preview).not.toContain("resolvedPillRowHeight");
  });
});
