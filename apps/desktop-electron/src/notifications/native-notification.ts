/**
 * Keep Electron Notification objects alive until the OS reports show/failed.
 * macOS addNotificationRequest is async; if the JS object is GC'd first,
 * both the `failed` (permission) event and the foreground banner are dropped
 * and the toast is only filed in Notification Center.
 */

export type NativeNotificationSendResult =
  | { ok: true }
  | {
      ok: false;
      code: "unsupported" | "permission_denied" | "failed";
      error?: string;
    };

type NativeNotificationLike = {
  once(
    event: "show" | "failed" | "close",
    listener: (...args: unknown[]) => void,
  ): unknown;
  show(): void;
};

const liveNotifications = new Set<NativeNotificationLike>();
const LIVE_MS = 60_000;
const RESULT_TIMEOUT_MS = 20_000;

export function classifyNativeNotificationError(
  error: string,
): "permission_denied" | "failed" {
  const text = error.trim().toLowerCase();
  if (
    /not authorized|not allowed|denied|permission|notifications are not enabled|must be authorized|not permitted/.test(
      text,
    )
  ) {
    return "permission_denied";
  }
  return "failed";
}

export function retainNativeNotification(
  notification: NativeNotificationLike,
): void {
  liveNotifications.add(notification);
  const drop = () => {
    liveNotifications.delete(notification);
  };
  notification.once("close", drop);
  notification.once("failed", drop);
  setTimeout(drop, LIVE_MS);
}

export function waitForNativeNotificationResult(
  notification: NativeNotificationLike,
  options: { timeoutMs?: number } = {},
): Promise<NativeNotificationSendResult> {
  const timeoutMs = options.timeoutMs ?? RESULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: NativeNotificationSendResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    notification.once("show", () => finish({ ok: true }));
    notification.once("failed", (...args: unknown[]) => {
      const error =
        args.find((value): value is string => typeof value === "string") ??
        "Notification failed";
      finish({
        ok: false,
        code: classifyNativeNotificationError(error),
        error,
      });
    });
    setTimeout(() => finish({ ok: true }), timeoutMs);
  });
}

export function liveNativeNotificationCountForTests(): number {
  return liveNotifications.size;
}
