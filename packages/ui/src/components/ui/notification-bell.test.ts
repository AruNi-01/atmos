import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dir, "notification-bell.tsx"), "utf8");

describe("NotificationBell", () => {
  test("keeps the muted glyph and colors only the badge", () => {
    expect(source).toContain("COLORS[color]");
    expect(source).toContain('const GLYPH = "text-[#868593] dark:text-[#9B9AA7]"');
    expect(source).toContain("bg-[#34C759]");
    expect(source).toContain("bg-[#FF9500]");
    expect(source).not.toContain("text-[#34C759]");
    expect(source).not.toContain("text-[#FF9500]");
  });
});
