import { describe, expect, it } from "bun:test";
import {
  COMPOSER_DOCK_MS,
  COMPOSER_HERO_Y_BIAS,
  COMPOSER_UNDOCK_MS,
  DOCK_LOGO,
  DOCK_TRANSCRIPT,
  UNDOCK_LOGO,
  UNDOCK_TRANSCRIPT,
  composerDockDurationMs,
  composerDockMotion,
  composerLogoChrome,
  composerTranscriptChrome,
  heroComposerOffset,
} from "@/features/agent/lib/agent-chat-composer-dock";

describe("heroComposerOffset", () => {
  it("lifts a bottom-docked stack to vertical center", () => {
    const column = 800;
    const stack = 200;
    const offset = heroComposerOffset(column, stack);
    expect(offset).toBe((column - stack) / 2 + COMPOSER_HERO_Y_BIAS - (column - stack));
    expect(offset).toBeLessThan(0);
    expect(stack + Math.abs(offset) + (column - stack - Math.abs(offset))).toBe(column);
  });

  it("does not move when the stack fills the column", () => {
    expect(heroComposerOffset(400, 400)).toBe(0);
    expect(heroComposerOffset(400, 480)).toBe(0);
    expect(heroComposerOffset(0, 120)).toBe(0);
    expect(heroComposerOffset(800, 0)).toBe(0);
  });
});

describe("composer dock chrome", () => {
  it("docks faster than it returns, and reduced motion snaps", () => {
    expect(composerDockDurationMs(true)).toBe(COMPOSER_DOCK_MS);
    expect(composerDockDurationMs(false)).toBe(COMPOSER_UNDOCK_MS);
    expect(composerDockMotion(true, false).duration).toBe(COMPOSER_DOCK_MS / 1000);
    expect(composerDockMotion(false, false).duration).toBe(COMPOSER_UNDOCK_MS / 1000);
    expect(composerDockMotion(true, true).duration).toBe(0);
    expect(composerDockMotion(false, true).duration).toBe(0);
  });

  it("fades the logo after the transcript starts on send", () => {
    const logo = composerLogoChrome(true, false);
    const transcript = composerTranscriptChrome(true, false);
    expect(logo.opacity).toBe(0);
    expect(transcript.opacity).toBe(1);
    expect(transcript.delay).toBe((DOCK_TRANSCRIPT.start * COMPOSER_DOCK_MS) / 1000);
    expect(logo.delay).toBe((DOCK_LOGO.start * COMPOSER_DOCK_MS) / 1000);
    expect(logo.delay).toBeGreaterThan(transcript.delay);
  });

  it("clears the transcript before hero chrome returns", () => {
    const logo = composerLogoChrome(false, false);
    const transcript = composerTranscriptChrome(false, false);
    expect(logo.opacity).toBe(1);
    expect(transcript.opacity).toBe(0);
    expect(transcript.delay).toBe((UNDOCK_TRANSCRIPT.start * COMPOSER_UNDOCK_MS) / 1000);
    expect(logo.delay).toBe((UNDOCK_LOGO.start * COMPOSER_UNDOCK_MS) / 1000);
    expect(logo.delay).toBeGreaterThan(transcript.delay);
  });

  it("snaps chrome when motion is reduced", () => {
    expect(composerLogoChrome(true, true)).toEqual({
      opacity: 0,
      y: 0,
      delay: 0,
      duration: 0,
    });
    expect(composerTranscriptChrome(false, true)).toEqual({
      opacity: 0,
      y: 0,
      delay: 0,
      duration: 0,
    });
  });
});
