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

  test("hides an empty model label and interpolates compact vs expanded padding from the helper", () => {
    expect(composerSource).toContain("composerDockInputPadding(false)");
    expect(composerSource).toContain("composerDockInputPadding(true)");
    expect(composerSource).toContain("COMPACT_PAD.paddingLeft");
    expect(composerSource).toContain("EXPANDED_PAD.paddingLeft");
    expect(composerSource).not.toContain(
      "[COMPOSER_COMPACT_PAD_HORIZONTAL, COMPOSER_EXPANDED_PAD_HORIZONTAL]",
    );
    expect(composerSource).toContain("showNoAgent");
    expect(composerSource).not.toContain("|| copy.model");
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
