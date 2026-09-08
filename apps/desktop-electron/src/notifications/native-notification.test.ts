import { describe, expect, it } from "bun:test";
import {
  classifyNativeNotificationError,
  retainNativeNotification,
  waitForNativeNotificationResult,
  liveNativeNotificationCountForTests,
} from "./native-notification.ts";

function fakeNotification(options: {
  emitShow?: boolean;
  emitFailed?: string;
}): {
  show: () => void;
  once: (
    event: "show" | "failed" | "close",
    listener: (...args: unknown[]) => void,
  ) => void;
} {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    once(event, listener) {
      (listeners[event] ??= []).push(listener);
    },
    show() {
      queueMicrotask(() => {
        if (options.emitFailed != null) {
          for (const listener of listeners.failed ?? []) {
            listener({}, options.emitFailed);
          }
          return;
        }
        if (options.emitShow) {
          for (const listener of listeners.show ?? []) listener({});
        }
      });
    },
  };
}

describe("classifyNativeNotificationError", () => {
  it("maps OS permission failures", () => {
    expect(
      classifyNativeNotificationError("Notifications are not allowed"),
    ).toBe("permission_denied");
    expect(classifyNativeNotificationError("not authorized to post")).toBe(
      "permission_denied",
    );
    expect(classifyNativeNotificationError("Permission denied")).toBe(
      "permission_denied",
    );
  });

  it("keeps unsigned / generic delivery errors as failed", () => {
    expect(
      classifyNativeNotificationError("application must be code-signed"),
    ).toBe("failed");
    expect(classifyNativeNotificationError("unknown")).toBe("failed");
  });
});

describe("waitForNativeNotificationResult", () => {
  it("resolves ok when the OS reports show", async () => {
    const notification = fakeNotification({ emitShow: true });
    retainNativeNotification(notification);
    const pending = waitForNativeNotificationResult(notification, {
      timeoutMs: 500,
    });
    notification.show();
    await expect(pending).resolves.toEqual({ ok: true });
    expect(liveNativeNotificationCountForTests()).toBeGreaterThan(0);
  });

  it("resolves permission_denied when the OS reports a permission error", async () => {
    const notification = fakeNotification({
      emitFailed: "Notifications are not allowed for this application",
    });
    retainNativeNotification(notification);
    const pending = waitForNativeNotificationResult(notification, {
      timeoutMs: 500,
    });
    notification.show();
    await expect(pending).resolves.toEqual({
      ok: false,
      code: "permission_denied",
      error: "Notifications are not allowed for this application",
    });
  });
});
