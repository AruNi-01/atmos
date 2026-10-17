// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

describe("message copy button", () => {
  test("matches the web size-6 icon button", () => {
    const source = readFileSync(join(dir, "copy-message-button.tsx"), "utf8");
    expect(source).toContain("export const COPY_BUTTON_PX = 24");
    expect(source).toContain("export const COPY_ICON_PX = 14");
    expect(source).toContain("export const COPY_BUTTON_RADIUS = 8");
    expect(source).toContain("export const COPY_FEEDBACK_MS = 1200");
    expect(source).toContain("TOOL_ADDITION_COLOR");
    expect(source).toContain("duration: COPY_SWAP_MS");
    expect(source).toContain("scale.set(0.85)");
    expect(source).toContain("<Check ");
    expect(source).toContain("<Copy ");
    expect(source).not.toContain("copy.copyMessage");
    const user = readFileSync(join(dir, "user-message.tsx"), "utf8");
    const footer = readFileSync(join(dir, "assistant-footer.tsx"), "utf8");
    expect(user).toContain("copy.copyUserAria");
    expect(user).not.toContain("copy.copyMessage");
    expect(footer).toContain("copy.copyAssistantAria");
    expect(footer).not.toContain("copy.copyMessage");
  });
});
