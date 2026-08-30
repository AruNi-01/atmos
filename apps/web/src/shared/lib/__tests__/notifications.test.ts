import { afterEach, describe, expect, test } from "bun:test";
import {
  automationNotificationHref,
  isAppFocused,
  isNotificationClickAction,
  shouldShowSystemNotification,
} from "../notifications";

const originalDocument = globalThis.document;

function mockDocument(state: { visibilityState: DocumentVisibilityState; hasFocus: boolean }) {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      visibilityState: state.visibilityState,
      hasFocus: () => state.hasFocus,
    },
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
});

describe("isAppFocused", () => {
  test("is true only when visible and focused", () => {
    mockDocument({ visibilityState: "visible", hasFocus: true });
    expect(isAppFocused()).toBe(true);

    mockDocument({ visibilityState: "visible", hasFocus: false });
    expect(isAppFocused()).toBe(false);

    mockDocument({ visibilityState: "hidden", hasFocus: true });
    expect(isAppFocused()).toBe(false);
  });
});

describe("shouldShowSystemNotification", () => {
  test("always shows when whenFocused is enabled", () => {
    mockDocument({ visibilityState: "visible", hasFocus: true });
    expect(shouldShowSystemNotification(true)).toBe(true);

    mockDocument({ visibilityState: "hidden", hasFocus: false });
    expect(shouldShowSystemNotification(true)).toBe(true);
  });

  test("suppresses while focused when whenFocused is disabled", () => {
    mockDocument({ visibilityState: "visible", hasFocus: true });
    expect(shouldShowSystemNotification(false)).toBe(false);
  });

  test("shows in background when whenFocused is disabled", () => {
    mockDocument({ visibilityState: "hidden", hasFocus: false });
    expect(shouldShowSystemNotification(false)).toBe(true);

    mockDocument({ visibilityState: "visible", hasFocus: false });
    expect(shouldShowSystemNotification(false)).toBe(true);
  });
});

describe("isNotificationClickAction", () => {
  test("accepts agent_hook and automation actions", () => {
    expect(
      isNotificationClickAction({
        kind: "agent_status",
        session_id: "s1",
        context_id: "ws-1",
        pane_id: "ws-1:win",
      }),
    ).toBe(true);
    expect(
      isNotificationClickAction({
        kind: "automation",
        automation_guid: "a1",
        run_guid: "r1",
      }),
    ).toBe(true);
  });

  test("rejects incomplete or unknown payloads", () => {
    expect(isNotificationClickAction(null)).toBe(false);
    expect(isNotificationClickAction({})).toBe(false);
    expect(isNotificationClickAction({ kind: "agent_status" })).toBe(false);
    expect(isNotificationClickAction({ kind: "automation" })).toBe(false);
    expect(isNotificationClickAction({ kind: "other", session_id: "x" })).toBe(false);
  });
});

describe("automationNotificationHref", () => {
  test("builds automations deep link with optional run", () => {
    expect(automationNotificationHref("auto-1")).toBe(
      "/automations?automationId=auto-1",
    );
    expect(automationNotificationHref("auto-1", "run-9")).toBe(
      "/automations?automationId=auto-1&automationRun=run-9&automationTab=history",
    );
  });
});

describe("resolveAgentNotificationIconSrc", () => {
  test("maps known agent tools to public agent icon paths", async () => {
    const { resolveAgentNotificationIconSrc } = await import("../notifications");
    expect(resolveAgentNotificationIconSrc("grok-build")).toBe(
      "/agents/grok-build-light.svg",
    );
    expect(resolveAgentNotificationIconSrc("claude-code")).toContain("/agents/");
    expect(resolveAgentNotificationIconSrc(null)).toBe("/notification-icon.png");
  });
});
