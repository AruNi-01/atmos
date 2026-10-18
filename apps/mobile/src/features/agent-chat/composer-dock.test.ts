// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  COMPOSER_COMPACT_PAD_HORIZONTAL,
  COMPOSER_DOCK_COMPACT_HEIGHT,
  COMPOSER_DOCK_EXPAND_MS,
  COMPOSER_EXPANDED_PAD_HORIZONTAL,
  COMPOSER_LINE_HEIGHT,
  COMPOSER_MAX_LINES,
  composerDockExpanded,
  composerDockInputPadding,
  composerDockMinHeight,
  composerDockMotionDuration,
} from "./composer-dock";

const composer = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "AgentChatComposer.tsx"),
  "utf8",
);

describe("composer dock expand", () => {
  test("idle empty unfocused stays compact", () => {
    expect(
      composerDockExpanded({ focused: false, text: "", contentHeight: COMPOSER_LINE_HEIGHT }),
    ).toBe(false);
    expect(
      composerDockExpanded({
        focused: false,
        text: "one line",
        contentHeight: COMPOSER_LINE_HEIGHT,
      }),
    ).toBe(false);
  });

  test("focus, the model sheet, follow-up, or wrapped text expand", () => {
    expect(
      composerDockExpanded({ focused: true, text: "", contentHeight: COMPOSER_LINE_HEIGHT }),
    ).toBe(true);
    expect(
      composerDockExpanded({
        focused: false,
        text: "",
        contentHeight: COMPOSER_LINE_HEIGHT,
        modelsOpen: true,
      }),
    ).toBe(true);
    expect(
      composerDockExpanded({
        focused: false,
        text: "queued",
        contentHeight: COMPOSER_LINE_HEIGHT,
        showQueue: true,
      }),
    ).toBe(true);
    expect(
      composerDockExpanded({
        focused: false,
        text: "a\nb",
        contentHeight: COMPOSER_LINE_HEIGHT,
      }),
    ).toBe(true);
    expect(
      composerDockExpanded({
        focused: false,
        text: "wraps",
        contentHeight: COMPOSER_LINE_HEIGHT * 2,
      }),
    ).toBe(true);
  });

  test("compact is one row; expanded clears a toolbar row under the field", () => {
    expect(COMPOSER_DOCK_COMPACT_HEIGHT).toBe(52);
    expect(composerDockMinHeight({ expanded: false, contentHeight: 80 })).toBe(52);
    expect(composerDockMinHeight({ expanded: true, contentHeight: COMPOSER_LINE_HEIGHT })).toBe(
      14 + COMPOSER_LINE_HEIGHT + 52,
    );
    expect(composerDockMinHeight({ expanded: true, contentHeight: 400 })).toBe(
      14 + COMPOSER_LINE_HEIGHT * COMPOSER_MAX_LINES + 52,
    );
    expect(composerDockInputPadding(false)).toEqual({
      paddingBottom: 15,
      paddingLeft: COMPOSER_COMPACT_PAD_HORIZONTAL,
      paddingRight: COMPOSER_COMPACT_PAD_HORIZONTAL,
      paddingTop: 15,
    });
    expect(composerDockInputPadding(true).paddingLeft).toBe(COMPOSER_EXPANDED_PAD_HORIZONTAL);
  });

  test("expand motion is 280ms unless Reduce Motion or only the text height changed", () => {
    expect(COMPOSER_DOCK_EXPAND_MS).toBe(280);
    expect(composerDockMotionDuration({ expandedChanged: true, reduceMotion: false })).toBe(280);
    expect(composerDockMotionDuration({ expandedChanged: true, reduceMotion: true })).toBe(0);
    expect(composerDockMotionDuration({ expandedChanged: false, reduceMotion: false })).toBe(0);
  });

  test("the composer animates the dock from focus with reanimated", () => {
    expect(composer).toContain("composerDockExpanded");
    expect(composer).toContain("onFocus");
    expect(composer).toContain("onBlur");
    expect(composer).toContain("withTiming");
    expect(composer).toContain("useReducedMotion");
    expect(composer).toContain("Easing.out(Easing.cubic)");
    expect(composer).toContain('pointerEvents="box-none"');
    expect(composer).toContain('pointerEvents="none"');
  });
});
