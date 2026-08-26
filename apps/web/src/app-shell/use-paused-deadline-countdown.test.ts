import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { usePausedDeadlineCountdown } from "./use-paused-deadline-countdown";

function Probe({
  sessionKey,
  paused,
  onComplete,
  onRemaining,
}: {
  sessionKey: string | null;
  paused: boolean;
  onComplete: () => void;
  onRemaining: (seconds: number) => void;
}) {
  const countdown = usePausedDeadlineCountdown({
    sessionKey,
    durationMs: 5_000,
    paused,
    onComplete,
  });
  onRemaining(countdown.remainingSeconds);
  return null;
}

describe("usePausedDeadlineCountdown", () => {
  let root: Root | null = null;
  let container: HTMLElement;

  beforeEach(() => {
    jest.useFakeTimers();
    const window = new Window({ url: "http://localhost/" });
    globalThis.window = window as unknown as typeof globalThis.window;
    globalThis.document = window.document as unknown as Document;
    container = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    jest.useRealTimers();
  });

  test("keeps remaining time across pause instead of restarting", () => {
    let remaining = 0;
    let completed = 0;
    const renderProbe = (paused: boolean) => {
      act(() => {
        root?.render(
          React.createElement(Probe, {
            sessionKey: "ws-1",
            paused,
            onComplete: () => {
              completed += 1;
            },
            onRemaining: (seconds) => {
              remaining = seconds;
            },
          }),
        );
      });
    };

    renderProbe(false);
    expect(remaining).toBe(5);

    act(() => {
      jest.advanceTimersByTime(1_200);
    });
    expect(remaining).toBe(4);

    renderProbe(true);
    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(remaining).toBe(4);
    expect(completed).toBe(0);

    renderProbe(false);
    expect(remaining).toBe(4);

    act(() => {
      jest.advanceTimersByTime(4_000);
    });
    expect(remaining).toBe(0);
    expect(completed).toBe(1);
  });
});
