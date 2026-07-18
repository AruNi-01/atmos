import { describe, expect, test } from "bun:test";

import {
  ENABLE_TUI_MOUSE_TRACKING,
  buildTerminalSnapshotRestorePayload,
  isInlineMouseTuiCommand,
  shouldRestoreTuiMouseTracking,
} from "./snapshot";
import type { TerminalSnapshot } from "./protocol";

function baseSnapshot(
  overrides: Partial<TerminalSnapshot> = {},
): TerminalSnapshot {
  return {
    data: "hello",
    cursor_x: 0,
    cursor_y: 0,
    cols: 80,
    rows: 24,
    alternate: false,
    ...overrides,
  };
}

describe("isInlineMouseTuiCommand", () => {
  test("matches grok and versioned install binaries", () => {
    expect(isInlineMouseTuiCommand("grok")).toBe(true);
    expect(isInlineMouseTuiCommand("/Users/me/.grok/bin/grok")).toBe(true);
    expect(isInlineMouseTuiCommand("grok-0.2.103-macos-aarch64")).toBe(true);
    expect(isInlineMouseTuiCommand("grok-0.2.103-ma")).toBe(true);
    expect(isInlineMouseTuiCommand("opencode")).toBe(false);
    expect(isInlineMouseTuiCommand("node")).toBe(false);
    expect(isInlineMouseTuiCommand("grokker")).toBe(false);
  });
});

describe("shouldRestoreTuiMouseTracking", () => {
  test("falls back to alternate when backend omits restore_mouse_tracking", () => {
    expect(shouldRestoreTuiMouseTracking({ alternate: true })).toBe(true);
    expect(shouldRestoreTuiMouseTracking({ alternate: false })).toBe(false);
  });

  test("honors explicit restore_mouse_tracking for inline TUIs", () => {
    expect(
      shouldRestoreTuiMouseTracking({
        alternate: false,
        restore_mouse_tracking: true,
      }),
    ).toBe(true);
    expect(
      shouldRestoreTuiMouseTracking({
        alternate: true,
        restore_mouse_tracking: false,
      }),
    ).toBe(false);
  });
});

describe("buildTerminalSnapshotRestorePayload", () => {
  test("restores mouse tracking for non-alternate inline TUI snapshots", () => {
    const { payload, useAlternateScreen, restoreMouseTracking } =
      buildTerminalSnapshotRestorePayload(
        baseSnapshot({
          alternate: false,
          restore_mouse_tracking: true,
        }),
      );

    expect(useAlternateScreen).toBe(false);
    expect(restoreMouseTracking).toBe(true);
    expect(payload.endsWith(ENABLE_TUI_MOUSE_TRACKING)).toBe(true);
    expect(payload.includes("\x1b[?1049l")).toBe(true);
  });

  test("restores mouse tracking for alternate-screen TUI snapshots", () => {
    const { payload, useAlternateScreen, restoreMouseTracking } =
      buildTerminalSnapshotRestorePayload(
        baseSnapshot({
          alternate: true,
          restore_mouse_tracking: true,
        }),
      );

    expect(useAlternateScreen).toBe(true);
    expect(restoreMouseTracking).toBe(true);
    expect(payload.includes("\x1b[?1049h")).toBe(true);
    expect(payload.endsWith(ENABLE_TUI_MOUSE_TRACKING)).toBe(true);
  });

  test("skips mouse restore for idle shell snapshots", () => {
    const { payload, restoreMouseTracking } = buildTerminalSnapshotRestorePayload(
      baseSnapshot({
        alternate: false,
        restore_mouse_tracking: false,
      }),
    );

    expect(restoreMouseTracking).toBe(false);
    expect(payload.includes(ENABLE_TUI_MOUSE_TRACKING)).toBe(false);
  });
});
