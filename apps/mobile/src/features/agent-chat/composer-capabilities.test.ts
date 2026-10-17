// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { composerCapabilities, contextTriggerLabel } from "./composer-capabilities";

const composerSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "AgentChatComposer.tsx"),
  "utf8",
);

describe("composer capabilities", () => {
  test("exposes the web composer surface without a microphone", () => {
    expect(composerCapabilities()).toEqual({
      attachments: true,
      paste: true,
      slash: true,
      mention: true,
      mode: true,
      permission: true,
      model: true,
      thinking: true,
      fast: true,
      contextTrigger: true,
      queue: true,
      steer: true,
      stop: true,
      microphone: false,
    });
  });

  test("the composer source has no microphone control", () => {
    expect(composerSource).not.toMatch(/Microphone/i);
    expect(composerSource).not.toMatch(/MicIcon/);
    expect(composerSource).not.toMatch(/\bmic\b/i);
    expect(composerSource).not.toMatch(/dictation/i);
  });

  test("the composer source opens the context card and chips large pastes", () => {
    expect(composerSource).toContain("onOpenCard");
    expect(composerSource).toContain("applyComposerPaste");
  });

  test("keeps the placeholder on its own line and hides an empty model label", () => {
    expect(composerSource).toContain("paddingHorizontal: 16");
    expect(composerSource).not.toContain("paddingLeft: 60");
    expect(composerSource).toContain("showNoAgent");
    expect(composerSource).not.toContain("|| copy.model");
    expect(composerSource).toContain("const LINE_HEIGHT = 20");
    expect(composerSource).toContain("const FIELD_FONT_SIZE = 14");
    expect(composerSource).toContain("const MAX_LINES = 8");
    expect(composerSource).toContain("const BUTTON_SIZE = 32");
    expect(composerSource).toContain("const SHELL_RADIUS = 22");
    expect(composerSource).toContain("composerShellFill");
    expect(composerSource).not.toContain("ChevronDownIcon");
  });

  test("the context trigger is the web ring and percent", () => {
    const contextAt = composerSource.indexOf("const renderContext");
    const context = composerSource.slice(contextAt, composerSource.indexOf("return (", contextAt));
    expect(context).toContain("<ContextRing");
    expect(context).toContain("fontSize: 11");
    expect(context).toContain('fontWeight: "500"');
    expect(context).not.toContain("GlassPanel");
  });

  test("labels the context trigger with the percent, or Context, only when that card is in the lane", () => {
    expect(contextTriggerLabel(null)).toBeNull();
    expect(contextTriggerLabel({ context_window: 1000 })).toBeNull();
    expect(contextTriggerLabel({ used: 10 })).toBeNull();
    expect(contextTriggerLabel({ used: 10, context_window: 0 })).toBeNull();
    expect(contextTriggerLabel({ used: 1200, context_window: 8000 })).toBe("15%");
    expect(contextTriggerLabel({ used: 100, size: 1000 })).toBe("10%");
    expect(contextTriggerLabel({ used: 1, context_window: 3 })).toBe("33%");
    expect(contextTriggerLabel({ used: 200, context_window: 100 })).toBe("100%");
    expect(contextTriggerLabel({ used: Number.NaN, context_window: 100 })).toBe("Context");
  });
});
