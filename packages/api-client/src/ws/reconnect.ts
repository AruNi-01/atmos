import type { ExhaustedBehavior, ReconnectPolicy } from "./types";

export function mergeReconnectPolicy(
  partial?: Partial<ReconnectPolicy>,
  base?: ReconnectPolicy,
): ReconnectPolicy {
  const b = base ?? {
    enabled: true,
    initialDelayMs: 1000,
    maxDelayMs: 30_000,
    maxAttempts: 10,
    exhausted: { type: "stop" } satisfies ExhaustedBehavior,
    reconnectOnCleanClose: false,
  };
  return {
    enabled: partial?.enabled ?? b.enabled,
    initialDelayMs: partial?.initialDelayMs ?? b.initialDelayMs,
    maxDelayMs: partial?.maxDelayMs ?? b.maxDelayMs,
    maxAttempts: partial?.maxAttempts ?? b.maxAttempts,
    exhausted: partial?.exhausted ?? b.exhausted,
    reconnectOnCleanClose:
      partial?.reconnectOnCleanClose ?? b.reconnectOnCleanClose,
  };
}

/** Delay for attempt index 0..maxAttempts-1 before exhausted policy. */
export function backoffDelayMs(
  policy: ReconnectPolicy,
  attemptIndex: number,
): number {
  return Math.min(
    policy.initialDelayMs * 2 ** attemptIndex,
    policy.maxDelayMs,
  );
}

export function redactUrl(url: string): string {
  return url
    .replace(/([?&]token=)[^&]*/gi, "$1<redacted>")
    .replace(/([?&]access_token=)[^&]*/gi, "$1<redacted>")
    .replace(/([?&]client_token=)[^&]*/gi, "$1<redacted>");
}
