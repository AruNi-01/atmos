// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { CHAT_AMBER } from "./amber-color";

const dir = dirname(fileURLToPath(import.meta.url));

describe("chat amber", () => {
  test("matches the sRGB clip of Tailwind amber-500", () => {
    expect(CHAT_AMBER).toBe("#fe9a00");
  });

  test("session hints and the attention dot use that amber, not theme yellow", () => {
    const session = readFileSync(join(dir, "session-chrome.tsx"), "utf8");
    const pills = readFileSync(join(dir, "composer-pill-row.tsx"), "utf8");
    expect(session).toContain("CHAT_AMBER");
    expect(session).not.toContain("colors.yellow");
    expect(pills).toContain("backgroundColor: CHAT_AMBER");
    expect(pills).not.toContain("theme.colors.yellow");
  });
});
