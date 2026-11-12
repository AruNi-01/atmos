import { describe, expect, test } from "bun:test";

import {
  attachTuiMouseWheelMultiplier,
  createTuiWheelDistanceState,
  resolveTuiWheelDistanceRows,
  resolveTuiWheelReportCount,
  shouldDisableTuiMouseOnCmdEnd,
  TUI_WHEEL_MAX_REPORTS_PER_EVENT,
  type TuiWheelTerminalLike,
} from "../tui-mouse-wheel";

describe("terminal mouse and screen mode detection", () => {
  function createTerminal() {
    const listeners = new Set<() => void>();
    const terminal: TuiWheelTerminalLike = {
      element: undefined,
      rows: 30,
      modes: { mouseTrackingMode: "none" },
      buffer: { active: { type: "normal" } },
      attachCustomWheelEventHandler() {},
      onWriteParsed(listener) {
        listeners.add(listener);
        return { dispose: () => listeners.delete(listener) };
      },
    };
    return {
      terminal,
      parsed() {
        for (const listener of listeners) listener();
      },
    };
  }

  test("reacts to mouse protocols and screen-only changes without a wheel gesture", () => {
    const { terminal, parsed } = createTerminal();
    const surfaces: string[] = [];
    const subscription = attachTuiMouseWheelMultiplier(terminal, {
      onMouseTrackingActiveChange: (active) => {
        surfaces.push(`${terminal.buffer.active.type}:${active}`);
      },
    });
    parsed();
    terminal.modes.mouseTrackingMode = "any";
    parsed();
    terminal.buffer.active.type = "alternate";
    parsed();
    terminal.buffer.active.type = "normal";
    parsed();
    terminal.modes.mouseTrackingMode = "none";
    parsed();
    expect(surfaces).toEqual([
      "normal:false",
      "normal:true",
      "alternate:true",
      "normal:true",
      "normal:false",
    ]);
    subscription.dispose();
    terminal.modes.mouseTrackingMode = "any";
    parsed();
    expect(surfaces).toHaveLength(5);
  });

  test("does not treat an alt-screen exit followed by mouse disable as an inline TUI", () => {
    const { terminal, parsed } = createTerminal();
    terminal.buffer.active.type = "alternate";
    terminal.modes.mouseTrackingMode = "any";
    const surfaces: string[] = [];
    const subscription = attachTuiMouseWheelMultiplier(terminal, {
      onMouseTrackingActiveChange: (active) => {
        surfaces.push(`${terminal.buffer.active.type}:${active}`);
      },
    });
    terminal.buffer.active.type = "normal";
    terminal.modes.mouseTrackingMode = "none";
    parsed();
    expect(surfaces).toEqual(["alternate:true", "normal:false"]);
    subscription.dispose();
  });
});

describe("resolveTuiWheelDistanceRows", () => {
  test("maps pixel distance using cell height", () => {
    expect(resolveTuiWheelDistanceRows({ deltaY: 48, deltaMode: 0 }, { cellHeight: 16 })).toBe(3);
  });

  test("maps line mode as rows", () => {
    expect(resolveTuiWheelDistanceRows({ deltaY: 3, deltaMode: 1 })).toBe(3);
  });
});

describe("resolveTuiWheelReportCount", () => {
  test("emits multiple reports for multi-cell pixel distance", () => {
    const state = createTuiWheelDistanceState();
    const reports = resolveTuiWheelReportCount({ deltaY: 48, deltaMode: 0 }, state, {
      cellHeight: 16,
    });
    expect(reports).toBe(3);
    expect(state.pendingRows).toBe(0);
  });

  test("accumulates fractional rows across events", () => {
    const state = createTuiWheelDistanceState();
    const first = resolveTuiWheelReportCount({ deltaY: 8, deltaMode: 0 }, state, {
      cellHeight: 16,
    });
    expect(first).toBe(0);
    expect(state.pendingRows).toBeCloseTo(0.5);

    const second = resolveTuiWheelReportCount({ deltaY: 8, deltaMode: 0 }, state, {
      cellHeight: 16,
    });
    expect(second).toBe(1);
    expect(state.pendingRows).toBeCloseTo(0);
  });

  test("line mode emits at least one report per notch", () => {
    const state = createTuiWheelDistanceState();
    expect(resolveTuiWheelReportCount({ deltaY: 1, deltaMode: 1 }, state)).toBe(1);
  });

  test("caps reports per event", () => {
    const state = createTuiWheelDistanceState();
    const reports = resolveTuiWheelReportCount({ deltaY: 10_000, deltaMode: 0 }, state, {
      cellHeight: 16,
    });
    expect(reports).toBe(TUI_WHEEL_MAX_REPORTS_PER_EVENT);
  });

  test("resets pending fraction on direction change", () => {
    const state = createTuiWheelDistanceState();
    resolveTuiWheelReportCount({ deltaY: 8, deltaMode: 0 }, state, { cellHeight: 16 });
    expect(state.pendingRows).toBeGreaterThan(0);
    resolveTuiWheelReportCount({ deltaY: -8, deltaMode: 0 }, state, { cellHeight: 16 });
    // After reverse, first half-row of opposite direction is stored.
    expect(state.pendingDirection).toBe(-1);
    expect(state.pendingRows).toBeCloseTo(0.5);
  });
});

describe("shouldDisableTuiMouseOnCmdEnd", () => {
  test("does not disable while on alternate buffer", () => {
    expect(shouldDisableTuiMouseOnCmdEnd("alternate")).toBe(false);
  });

  test("disables on normal buffer (shell / non-alt)", () => {
    expect(shouldDisableTuiMouseOnCmdEnd("normal")).toBe(true);
    expect(shouldDisableTuiMouseOnCmdEnd(undefined)).toBe(true);
  });
});
