// @ts-expect-error bun:test is available at runtime but not in the mobile tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  PARITY_COMPOSER_STEP_MS,
  parityComposerShotName,
  parityComposerStepAt,
  parityComposerSteps,
} from "./parity-composer-states";

const here = dirname(fileURLToPath(import.meta.url));

describe("parity composer capture steps", () => {
  test("steps idle, multiline, busy, suggestions, then keyboard focus", () => {
    const steps = parityComposerSteps();
    expect(steps.map((step) => step.id)).toEqual([
      "idle",
      "multiline",
      "busy",
      "suggestions",
      "keyboard",
    ]);
    expect(steps.map((step) => step.atMs)).toEqual([
      0,
      PARITY_COMPOSER_STEP_MS,
      PARITY_COMPOSER_STEP_MS * 2,
      PARITY_COMPOSER_STEP_MS * 3,
      PARITY_COMPOSER_STEP_MS * 4,
    ]);
    expect(parityComposerStepAt(0).id).toBe("idle");
    expect(parityComposerStepAt(PARITY_COMPOSER_STEP_MS - 1).id).toBe("idle");
    expect(parityComposerStepAt(PARITY_COMPOSER_STEP_MS).text).toContain("\n");
    expect(parityComposerStepAt(PARITY_COMPOSER_STEP_MS * 2)).toMatchObject({
      id: "busy",
      busy: true,
      followUp: true,
      focus: false,
    });
    expect(parityComposerStepAt(PARITY_COMPOSER_STEP_MS * 3).suggestions).toEqual([
      { id: "plan", title: "/plan", detail: "Plan the change" },
      { id: "review", title: "/review", detail: "Review the diff" },
    ]);
    expect(parityComposerStepAt(PARITY_COMPOSER_STEP_MS * 4)).toMatchObject({
      id: "keyboard",
      focus: true,
      busy: false,
    });
    expect(parityComposerStepAt(99_999).id).toBe("keyboard");
    for (const step of steps) {
      expect(parityComposerShotName(step.id)).toMatch(/^composer-[a-z]+$/);
    }
  });

  test("the preview applies the pin and the live composer does not auto-blur", () => {
    const preview = readFileSync(join(here, "preview-chat-screen.tsx"), "utf8");
    const composer = readFileSync(join(here, "AgentChatComposer.tsx"), "utf8");
    expect(preview).toContain('frame.composer === "states"');
    expect(preview).toContain("parityComposerSteps");
    expect(preview).toContain("[parity] composer done");
    expect(preview).toContain("busy={composerDriven ? composerShown.busy : false}");
    expect(preview).toContain("followUp={composerDriven ? composerShown.followUp : undefined}");
    expect(preview).toContain("autoFocus={composerDriven ? composerShown.focus : undefined}");
    expect(composer).toContain("if (props.autoFocus == null) return;");
    expect(composer).toContain('testID="agent-chat-composer-input"');
    expect(preview).toContain("[parity] keyboard height=${height}");
    expect(preview).toContain("keyboardDidShow");
    expect(preview).toContain("paddingBottom: keyboardHeight > 0 ? keyboardHeight : 0");
    const tap = readFileSync(
      join(
        here,
        "../../../../../scripts/agent-chat-parity/pill-tap/PillTapUITests/PillTapUITests.swift",
      ),
      "utf8",
    );
    const capture = readFileSync(
      join(here, "../../../../../scripts/agent-chat-parity/ios-capture.sh"),
      "utf8",
    );
    const workflow = readFileSync(
      join(here, "../../../../../.github/workflows/ci-mobile-ios-parity.yml"),
      "utf8",
    );
    const boot = readFileSync(
      join(here, "../../../../../scripts/agent-chat-parity/ios-boot-simulator.sh"),
      "utf8",
    );
    expect(tap).toContain("func testTapComposerField()");
    expect(tap).toContain('textViews["agent-chat-composer-input"]');
    expect(tap).toContain("keyboards.firstMatch");
    expect(capture).toContain("testTapComposerField");
    expect(capture).toContain("composer-keyboard.mov");
    expect(capture).toContain("capture_composer_keyboard");
    expect(workflow).toContain("ios-boot-simulator.sh");
    expect(boot).toContain("ConnectHardwareKeyboard -bool false");
  });
});
