// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "AgentChatSessionOpCard.tsx"),
  "utf8",
);

describe("session op card", () => {
  test("uses the sky glass row and leaves the shine border off", () => {
    expect(source).toContain("copy.sessionOpRequested");
    expect(source).toContain('request.kind === "fork" ? GitForkIcon : RotateIcon');
    expect(source).toContain("SESSION_OP_SKY");
    expect(source).toContain("GlassTextButton");
    expect(source).toContain("theme.colors.secondaryLabel");
    expect(source).toContain("option.name.trim()");
    expect(source).not.toContain("copy.sessionOpFork");
    expect(source).not.toContain("#00a6f4");
    expect(source).not.toContain('normalized.includes("cancel")');
    expect(source).not.toContain("ShineBorder");
    expect(source).not.toContain("chatMutedForeground");
  });
});
