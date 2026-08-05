/**
 * Coalesce high-frequency terminal input (APP-054).
 *
 * Trackpad / multi-report wheel paths enqueue many small mouse-report chunks.
 * Writing each chunk as its own WebSocket/tmux message adds hop latency and
 * makes TUI scrolling feel delayed. Merge consecutive small payloads in one
 * microtask so the PTY still sees the same byte stream in one burst.
 */

export const TERMINAL_INPUT_COALESCE_MAX_CHARS = 4096;

export type TerminalInputCoalesceQueue = {
  enqueue: (data: string) => void;
  flush: () => void;
  clear: () => void;
};

export type TerminalInputCoalesceDeps = {
  send: (data: string) => void;
  /** When false, drop enqueued data (e.g. disposed terminal). */
  isActive?: () => boolean;
  schedule?: (flush: () => void) => void;
};

function defaultSchedule(flush: () => void): void {
  queueMicrotask(flush);
}

/** True for typical mouse-report / short control sequences that benefit from merging. */
export function shouldCoalesceTerminalInputChunk(data: string): boolean {
  if (!data || data.length > TERMINAL_INPUT_COALESCE_MAX_CHARS) {
    return false;
  }
  // SGR mouse / legacy mouse / CSI fragments are high frequency when scrolling.
  if (data.includes("\x1b[<") || data.includes("\x1b[M") || data.includes("\x1b[?")) {
    return true;
  }
  // Very short printable/control bursts (single keys still pass through alone
  // when not batched with neighbors, but auto-repeat benefits from merge).
  return data.length <= 8;
}

export function createTerminalInputCoalesceQueue(
  deps: TerminalInputCoalesceDeps,
): TerminalInputCoalesceQueue {
  const schedule = deps.schedule ?? defaultSchedule;
  let pending = "";
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    if (!pending) return;
    if (deps.isActive && !deps.isActive()) {
      pending = "";
      return;
    }
    const payload = pending;
    pending = "";
    deps.send(payload);
  };

  return {
    enqueue(data: string) {
      if (!data) return;
      if (deps.isActive && !deps.isActive()) return;

      if (!shouldCoalesceTerminalInputChunk(data) && pending.length === 0) {
        deps.send(data);
        return;
      }

      if (pending.length + data.length > TERMINAL_INPUT_COALESCE_MAX_CHARS) {
        flush();
        if (data.length > TERMINAL_INPUT_COALESCE_MAX_CHARS) {
          deps.send(data);
          return;
        }
      }

      pending += data;
      if (!scheduled) {
        scheduled = true;
        schedule(flush);
      }
    },
    flush,
    clear() {
      pending = "";
      scheduled = false;
    },
  };
}
