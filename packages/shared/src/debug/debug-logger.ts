/**
 * Frontend debug logger — writes structured log entries to the backend which
 * appends them to `./logs/debug/frontend-YYYY-MM-DD.log`.
 *
 * Designed to be reusable across the whole frontend whenever detailed debug
 * logging is needed (e.g. terminal lifecycle, WebSocket events, etc.).
 *
 * Usage:
 * ```ts
 * import { DebugLogger } from "@atmos/shared/utils/debug-logger";
 *
 * const logger = new DebugLogger("terminal", "http://localhost:30303");
 * logger.log("WS_CONNECT", "WebSocket connecting", { sessionId: "abc" });
 * ```
 *
 * All network errors are silently swallowed — this utility should never crash
 * the app.
 */

export interface DebugLogEntry {
  ts: string;
  cat: string;
  msg: string;
  data?: Record<string, unknown>;
}

export class DebugLogger {
  private readonly prefix: string;
  private readonly apiBase: string;
  private readonly queue: DebugLogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushIntervalMs: number;

  /**
   * @param prefix      Short label, e.g. "terminal" — written into the filename
   * @param apiBase     Base URL of the API server, e.g. "http://localhost:30303"
   * @param flushInterval Milliseconds between batch flushes (default 200ms)
   */
  constructor(prefix: string, apiBase: string, flushInterval = 200) {
    this.prefix = prefix;
    this.apiBase = apiBase.replace(/\/$/, "");
    this.flushIntervalMs = flushInterval;
  }

  /**
   * Queue a log entry for sending to the backend.
   *
   * @param category  ALL_CAPS event label, e.g. "WS_CONNECT"
   * @param msg       Human-readable description
   * @param data      Optional structured key/value data
   */
  log(
    category: string,
    msg: string,
    data?: Record<string, unknown>
  ): void {
    const entry: DebugLogEntry = {
      ts: new Date().toISOString(),
      cat: category,
      msg,
      ...(data ? { data } : {}),
    };

    // Also emit to browser console for convenience during active debugging
    console.debug(`[DEBUG:${this.prefix}] [${category}] ${msg}`, data ?? "");

    this.queue.push(entry);
    this.scheduleFlush();
  }

  /** Immediately flush all queued entries.  Called automatically on schedule. */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const entries = this.queue.splice(0, this.queue.length);

    try {
      await fetch(`${this.apiBase}/api/system/debug-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: this.prefix, entries }),
        // keepalive: true allows the request to survive page unload (useful for
        // logging disconnect events right before navigation away)
        keepalive: true,
      });
    } catch {
      // Silently discard — the app must not be affected by logging failures
    }
  }

  /** Cancel pending flush and drop queued entries (call on unmount if desired). */
  destroy(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.queue.length = 0;
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }
}

/**
 * Module-level singleton factory.  Call `getDebugLogger(prefix, apiBase)` once
 * per module and reuse the returned instance throughout.
 */
const _loggers = new Map<string, DebugLogger>();

export function getDebugLogger(prefix: string, apiBase: string): DebugLogger {
  const key = `${prefix}@${apiBase}`;
  if (!_loggers.has(key)) {
    _loggers.set(key, new DebugLogger(prefix, apiBase));
  }
  return _loggers.get(key)!;
}
