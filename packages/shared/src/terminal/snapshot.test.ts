import { describe, expect, test } from "bun:test";

import {
  ENABLE_TUI_MOUSE_TRACKING,
  buildTerminalSnapshotRestorePayload,
  isInlineMouseTuiCommand,
  mouseTrackingRestoreSequence,
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

describe("ENABLE_TUI_MOUSE_TRACKING", () => {
  test("includes any-motion (1003) so hover reports reach the TUI", () => {
    // xterm.js treats 1000/1002/1003 as exclusive; the last SET wins.
    // Order ends with 1003 before SGR 1006 so activeProtocol is ANY.
    expect(ENABLE_TUI_MOUSE_TRACKING).toContain("\x1b[?1003h");
    expect(ENABLE_TUI_MOUSE_TRACKING.indexOf("\x1b[?1003h")).toBeGreaterThan(
      ENABLE_TUI_MOUSE_TRACKING.indexOf("\x1b[?1002h"),
    );
    expect(ENABLE_TUI_MOUSE_TRACKING.indexOf("\x1b[?1006h")).toBeGreaterThan(
      ENABLE_TUI_MOUSE_TRACKING.indexOf("\x1b[?1003h"),
    );
  });
});

describe("mouseTrackingRestoreSequence", () => {
  test("prefers exact backend sequence over the default", () => {
    const exact = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";
    expect(
      mouseTrackingRestoreSequence({
        alternate: true,
        restore_mouse_tracking: true,
        mouse_tracking_sequence: exact,
      }),
    ).toBe(exact);
  });

  test("falls back to full default (with 1003) when only the flag is set", () => {
    expect(
      mouseTrackingRestoreSequence({
        alternate: true,
        restore_mouse_tracking: true,
      }),
    ).toBe(ENABLE_TUI_MOUSE_TRACKING);
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

  test("uses exact mouse_tracking_sequence when provided", () => {
    const exact = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";
    const { payload, restoreMouseTracking } = buildTerminalSnapshotRestorePayload(
      baseSnapshot({
        alternate: true,
        restore_mouse_tracking: true,
        mouse_tracking_sequence: exact,
      }),
    );

    expect(restoreMouseTracking).toBe(true);
    expect(payload.endsWith(exact)).toBe(true);
    expect(payload.includes("\x1b[?1003h")).toBe(false);
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
