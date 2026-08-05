// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import {
  applyTuiMouseScrollbackPolicy,
  CLEAR_XTERM_SCROLLBACK,
  discardXtermScrollbackWhileMouseTui,
} from "../terminal-runtime-utils";
import { DEFAULT_TERMINAL_SCROLLBACK } from "../theme";

function makeTerm(scrollback: number) {
  const writes: string[] = [];
  return {
    options: { scrollback } as { scrollback?: number },
    writes,
    write(data: string) {
      writes.push(data);
    },
  };
}

describe("applyTuiMouseScrollbackPolicy", () => {
  it("forces scrollback 0 and clears history when mouse TUI becomes active", () => {
    const term = makeTerm(DEFAULT_TERMINAL_SCROLLBACK);
    applyTuiMouseScrollbackPolicy(term, true);
    expect(term.options.scrollback).toBe(0);
    expect(term.writes).toEqual([CLEAR_XTERM_SCROLLBACK]);
  });

  it("does not re-clear on repeated active sync (chrome observer noise)", () => {
    const term = makeTerm(DEFAULT_TERMINAL_SCROLLBACK);
    applyTuiMouseScrollbackPolicy(term, true);
    applyTuiMouseScrollbackPolicy(term, true);
    applyTuiMouseScrollbackPolicy(term, true);
    expect(term.options.scrollback).toBe(0);
    expect(term.writes).toEqual([CLEAR_XTERM_SCROLLBACK]);
  });

  it("restores idle scrollback when mouse tracking ends", () => {
    const term = makeTerm(0);
    applyTuiMouseScrollbackPolicy(term, false);
    expect(term.options.scrollback).toBe(DEFAULT_TERMINAL_SCROLLBACK);
    expect(term.writes).toEqual([]);
  });
});

describe("discardXtermScrollbackWhileMouseTui", () => {
  it("writes CSI 3J only while mouse TUI is active", () => {
    const term = makeTerm(0);
    discardXtermScrollbackWhileMouseTui(term, false);
    expect(term.writes).toEqual([]);
    discardXtermScrollbackWhileMouseTui(term, true);
    expect(term.writes).toEqual([CLEAR_XTERM_SCROLLBACK]);
  });
});
