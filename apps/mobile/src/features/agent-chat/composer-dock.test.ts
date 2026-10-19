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
  COMPOSER_DOCK_EXPANDED_MAX_HEIGHT,
  COMPOSER_EXPANDED_PAD_HORIZONTAL,
  COMPOSER_LINE_HEIGHT,
  COMPOSER_MAX_LINES,
  composerDockCompactInnerWidth,
  composerDockCompactLineCount,
  composerDockContentHeight,
  composerDockExpanded,
  composerDockFieldHeight,
  composerDockInputPadding,
  composerDockMinHeight,
  composerDockMotionDuration,
} from "./composer-dock";

const composer = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "AgentChatComposer.tsx"),
  "utf8",
);

const idle = {
  addOpen: false,
  compactLineCount: 1,
  focused: false,
  modelsOpen: false,
  showQueue: false,
  showSteer: false,
  text: "one line",
};

describe("composer dock expand", () => {
  test("idle empty unfocused stays compact", () => {
    expect(composerDockExpanded({ ...idle, text: "", compactLineCount: 1 })).toBe(false);
    expect(composerDockExpanded(idle)).toBe(false);
  });

  test("focus, sheets, follow-up, newline, or compact wrap expand", () => {
    expect(composerDockExpanded({ ...idle, focused: true, text: "" })).toBe(true);
    expect(composerDockExpanded({ ...idle, modelsOpen: true, text: "" })).toBe(true);
    expect(composerDockExpanded({ ...idle, addOpen: true, text: "" })).toBe(true);
    expect(composerDockExpanded({ ...idle, showQueue: true, text: "queued" })).toBe(true);
    expect(composerDockExpanded({ ...idle, showSteer: true, text: "steer" })).toBe(true);
    expect(composerDockExpanded({ ...idle, text: "a\nb" })).toBe(true);
    expect(composerDockExpanded({ ...idle, compactLineCount: 2, text: "wraps" })).toBe(true);
  });

  test("compact line count is measured at the compact inner width only", () => {
    expect(composerDockCompactInnerWidth(390)).toBe(390 - COMPOSER_COMPACT_PAD_HORIZONTAL * 2);
    expect(composerDockCompactLineCount({ measuredLines: 0, text: "" })).toBe(1);
    expect(composerDockCompactLineCount({ measuredLines: 2, text: "" })).toBe(1);
    expect(composerDockCompactLineCount({ measuredLines: 2, text: "wraps" })).toBe(2);
    expect(composerDockExpanded({ ...idle, compactLineCount: 1, text: "wraps" })).toBe(false);
    expect(composerDockExpanded({ ...idle, compactLineCount: 2, text: "wraps" })).toBe(true);
  });

  test("blur, keyboard dismiss, and model/add sheet close do not oscillate a wrapped draft", () => {
    const text = "this draft wraps at the compact inner width";
    const wrapped = { ...idle, compactLineCount: 2, text };
    const sequence = [
      composerDockExpanded({ ...wrapped, focused: true }),
      composerDockExpanded({ ...wrapped, focused: false }),
      composerDockExpanded({ ...wrapped, focused: false, modelsOpen: true }),
      composerDockExpanded({ ...wrapped, focused: false, modelsOpen: false }),
      composerDockExpanded({ ...wrapped, focused: false, addOpen: true }),
      composerDockExpanded({ ...wrapped, focused: false, addOpen: false }),
      composerDockExpanded({ ...wrapped, focused: false, showQueue: false, showSteer: false }),
    ];
    expect(sequence).toEqual([true, true, true, true, true, true, true]);

    const oneLine = { ...idle, compactLineCount: 1, text: "short" };
    expect(composerDockExpanded({ ...oneLine, focused: true })).toBe(true);
    expect(composerDockExpanded({ ...oneLine, focused: false })).toBe(false);
    expect(composerDockExpanded({ ...oneLine, modelsOpen: true })).toBe(true);
    expect(composerDockExpanded({ ...oneLine, modelsOpen: false })).toBe(false);
    expect(composerDockExpanded({ ...oneLine, addOpen: true })).toBe(true);
    expect(composerDockExpanded({ ...oneLine, addOpen: false })).toBe(false);
  });

  test("four Enter lines grow the field even if measured height is still one line", () => {
    const fourLines = "one\ntwo\nthree\nfour";
    const staleMeasure = COMPOSER_LINE_HEIGHT;
    expect(composerDockContentHeight(fourLines, staleMeasure)).toBe(COMPOSER_LINE_HEIGHT * 4);
    expect(
      composerDockFieldHeight({
        expanded: true,
        measuredHeight: staleMeasure,
        text: fourLines,
      }),
    ).toBe(COMPOSER_LINE_HEIGHT * 4);
    expect(
      composerDockMinHeight({
        contentHeight: composerDockContentHeight(fourLines, staleMeasure),
        expanded: true,
      }),
    ).toBe(14 + COMPOSER_LINE_HEIGHT * 4 + 52);
    expect(
      composerDockFieldHeight({
        expanded: false,
        measuredHeight: COMPOSER_LINE_HEIGHT * 4,
        text: fourLines,
      }),
    ).toBe(COMPOSER_LINE_HEIGHT);
    expect(composerDockContentHeight("wraps without breaks", 80)).toBe(80);
    expect(composerDockContentHeight("a\nb\nc\nd\ne\nf\ng\nh", staleMeasure)).toBe(
      COMPOSER_LINE_HEIGHT * COMPOSER_MAX_LINES,
    );
    expect(COMPOSER_DOCK_EXPANDED_MAX_HEIGHT).toBe(
      14 + COMPOSER_LINE_HEIGHT * COMPOSER_MAX_LINES + 52,
    );
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

  test("the composer wires reanimated maxHeight, compact-width measure, and dock helpers", () => {
    expect(composer).toContain('from "react-native-reanimated"');
    expect(composer).toContain("composerDockExpanded");
    expect(composer).toContain("composerDockFieldHeight");
    expect(composer).toContain("composerDockInputPadding(false)");
    expect(composer).toContain("composerDockInputPadding(true)");
    expect(composer).toContain("composerDockCompactLineCount");
    expect(composer).toContain("composerDockCompactInnerWidth");
    expect(composer).toContain("onTextLayout");
    expect(composer).toContain("onFocus");
    expect(composer).toContain("onBlur");
    expect(composer).toContain("withTiming");
    expect(composer).toContain("dockMaxHeight");
    expect(composer).toContain("useReducedMotion");
    expect(composer).toContain("Easing.out(Easing.cubic)");
    expect(composer).toContain('pointerEvents="box-none"');
    expect(composer).toContain('pointerEvents="none"');
    expect(composer).toContain("COMPOSER_DOCK_EXPANDED_MAX_HEIGHT");
    expect(composer).not.toContain("height: dockHeight");
    expect(composer).not.toMatch(/composerDockExpanded\(\{[^}]*contentHeight/);
    expect(composer).toContain("accessible={false}");
    expect(composer).toContain("accessibilityElementsHidden");
    expect(composer).toMatch(
      /ellipsizeMode="tail"\s+importantForAccessibility="no-hide-descendants"\s+numberOfLines=\{1\}\s+pointerEvents="none"/,
    );
  });
});
