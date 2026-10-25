// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  SCROLL_PILL_SLOT_GAP,
  SCROLL_PILL_SLOT_MS,
  dropClosedPill,
  reconcilePillPresence,
  scrollPillSlotWidth,
} from "./scroll-pill-slot";

const dir = dirname(fileURLToPath(import.meta.url));

describe("scroll pill slot", () => {
  test("keeps the gap inside the pinned width and hides a closed pill", () => {
    expect(SCROLL_PILL_SLOT_MS).toBe(180);
    expect(SCROLL_PILL_SLOT_GAP).toBe(8);
    expect(scrollPillSlotWidth(0)).toBe(0);
    expect(scrollPillSlotWidth(72)).toBe(80);
    expect(scrollPillSlotWidth(36, 0)).toBe(36);
  });

  test("keeps an exiting pill mounted in place until its slot closes", () => {
    const open = reconcilePillPresence(
      [],
      [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
        { id: "c", title: "C" },
      ],
    );
    const exiting = reconcilePillPresence(open, [
      { id: "a", title: "A" },
      { id: "c", title: "C2" },
    ]);
    expect(exiting).toEqual([
      { id: "a", title: "A", visible: true },
      { id: "b", title: "B", visible: false },
      { id: "c", title: "C2", visible: true },
    ]);
    expect(
      reconcilePillPresence(exiting, [
        { id: "a", title: "A" },
        { id: "c", title: "C2" },
      ]),
    ).toEqual(exiting);
    expect(dropClosedPill(exiting, "b").map((pill) => pill.id)).toEqual(["a", "c"]);
    const reopened = exiting.map((pill) => (pill.id === "b" ? { ...pill, visible: true } : pill));
    expect(dropClosedPill(reopened, "b")).toBe(reopened);
  });

  test("fades the slot over 180ms and keeps the row height until the exit finishes", () => {
    const row = readFileSync(join(dir, "composer-pill-row.tsx"), "utf8");
    const thread = readFileSync(join(dir, "AgentChatThreadScreen.tsx"), "utf8");
    const preview = readFileSync(join(dir, "preview-chat-screen.tsx"), "utf8");
    expect(row).toContain("SCROLL_PILL_SLOT_MS");
    expect(row).toContain("withTiming");
    expect(row).toContain("duration: reduced ? 0 : SCROLL_PILL_SLOT_MS");
    expect(row).toContain("scrollPillSlotWidth");
    expect(row).toContain("scrollPillSlotWidth(COMPOSER_GLASS_CONTROL_SIZE)");
    expect(row).toContain("scrollPillSlotWidth(contentWidth, gap)");
    expect(row).toContain("reconcilePillPresence");
    expect(row).toContain('position: "absolute"');
    expect(row).toContain('overflow: "hidden"');
    expect(row).not.toContain("rowWithScroll");
    expect(thread).toContain("const pillRowHeight = measuredPillRowHeight;");
    expect(thread).not.toContain("resolvedPillRowHeight");
    expect(preview).toContain("const pillRowHeight = pillHeight;");
    expect(preview).not.toContain("resolvedPillRowHeight");
  });
});
