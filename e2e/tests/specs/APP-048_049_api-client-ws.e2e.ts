import type { Page } from "@playwright/test";
import { expect, test } from "../../fixtures/test";
import {
  connectLocalComputer,
  stubComputerClientSettingsApi,
} from "../smoke/support/app-smoke";
import {
  attachAppWsObserver,
  isWsErrorEnvelope,
  isWsRequestEnvelope,
  isWsResponseEnvelope,
  listInboundResponses,
  listOutboundActions,
  openAppWsSessions,
  type ObservedAppWsSession,
} from "../smoke/support/ws-session-observe";

/**
 * APP-048 / APP-049 cutover:
 * - main-app `/ws` frames stay Rust-aligned envelopes
 * - web binding opens a single session kernel socket and issues snake_case actions
 * - connect/reload still leaves a usable workbench over that transport
 *
 * Scope: browser path only (mobile has package unit coverage; not Playwright).
 */

async function waitForAppWs(
  sessions: ObservedAppWsSession[],
  predicate: (open: ObservedAppWsSession[]) => boolean,
  timeoutMs = 45_000,
): Promise<ObservedAppWsSession[]> {
  await expect
    .poll(() => predicate(openAppWsSessions(sessions)), { timeout: timeoutMs })
    .toBe(true);
  return openAppWsSessions(sessions);
}

async function waitForRequestTraffic(
  sessions: ObservedAppWsSession[],
  timeoutMs = 60_000,
): Promise<void> {
  await expect
    .poll(() => listOutboundActions(sessions).length, { timeout: timeoutMs })
    .toBeGreaterThan(0);
  await expect
    .poll(() => listInboundResponses(sessions).length, { timeout: timeoutMs })
    .toBeGreaterThan(0);
}

async function expectWorkbenchConnected(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: /Search/ })).toBeVisible({
    timeout: 45_000,
  });
}

test.describe("APP-048/049 api-types + api-client web cutover", () => {
  test("@stateful main /ws opens after local connect and carries request/response envelopes", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const sessions = attachAppWsObserver(page);
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);
    await expectWorkbenchConnected(page);

    const open = await waitForAppWs(sessions, (list) => list.length >= 1);
    expect(open.length, "expected at least one open app /ws session").toBeGreaterThan(0);
    expect(open[0]!.url).toMatch(/\/ws/);

    // Connect + project seed traffic should produce correlated request/response frames.
    await waitForRequestTraffic(sessions);

    const actions = listOutboundActions(sessions);
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action, `action must be snake_case wire name: ${action}`).toMatch(
        /^[a-z][a-z0-9_]*$/,
      );
    }

    // At least one multi-client catalog action used by workbench bootstrap.
    const catalogActions = [
      "project_list",
      "workspace_list",
      "project_create",
      "workspace_create",
      "fs_get_home_dir",
      "client_session_sync",
      "settings_get",
      "project_workspace_bootstrap",
    ];
    await expect
      .poll(() => listOutboundActions(sessions).some((action) => catalogActions.includes(action)), {
        timeout: 45_000,
      })
      .toBe(true);

    const responses = listInboundResponses(sessions);
    expect(responses.length).toBeGreaterThan(0);
    expect(
      responses.some((response) => response.success),
      "expected at least one successful WS response over the app session",
    ).toBe(true);

    // Spot-check envelope parsers against live frames (APP-048 M2).
    const sampleOut = sessions
      .flatMap((session) => session.frames)
      .find((frame) => frame.direction === "out" && isWsRequestEnvelope(frame.parsed));
    const sampleIn = sessions
      .flatMap((session) => session.frames)
      .find((frame) => frame.direction === "in" && isWsResponseEnvelope(frame.parsed));
    expect(sampleOut, "missing outbound request envelope").toBeTruthy();
    expect(sampleIn, "missing inbound response envelope").toBeTruthy();

    // Errors must still match Rust error envelope if any appear.
    for (const frame of sessions.flatMap((session) => session.frames)) {
      if (frame.direction !== "in" || !isRecordType(frame.parsed, "error")) continue;
      expect(isWsErrorEnvelope(frame.parsed)).toBe(true);
    }
  });

  test("@stateful reload reconnects app /ws without leaving the workbench disconnected", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const sessions = attachAppWsObserver(page);
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);
    await expectWorkbenchConnected(page);
    await waitForAppWs(sessions, (list) => list.length >= 1);
    await waitForRequestTraffic(sessions);

    const beforeReloadActions = listOutboundActions(sessions).length;
    const beforeOpen = openAppWsSessions(sessions).length;

    await page.reload({ waitUntil: "domcontentloaded" });
    // LocalStorage still has onboarding complete; computer connection should recover.
    await expectWorkbenchConnected(page);

    await waitForAppWs(sessions, (list) => list.length > beforeOpen || list.length >= 1);
    await expect
      .poll(() => listOutboundActions(sessions).length, { timeout: 60_000 })
      .toBeGreaterThan(beforeReloadActions);

    const openAfter = openAppWsSessions(sessions);
    expect(openAfter.length).toBeGreaterThan(0);
    expect(listInboundResponses(sessions).length).toBeGreaterThan(0);
  });

  test("@stateful app /ws does not open parallel seed-only dual authorities during shell use", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const sessions = attachAppWsObserver(page);
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);
    await expectWorkbenchConnected(page);
    await waitForRequestTraffic(sessions);

    // Exercise shell surfaces that re-issue Query/WS reads after cutover.
    await page.getByRole("button", { name: /Search/ }).click({ noWaitAfter: true });
    await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Refresh page" }).click();
    await expectWorkbenchConnected(page);

    // Concurrent open app sockets should stay small (one primary session).
    // Allow a short reconnect window after refresh (0–2 open at a moment).
    await expect
      .poll(() => openAppWsSessions(sessions).length, { timeout: 30_000 })
      .toBeLessThanOrEqual(2);

    const actions = listOutboundActions(sessions);
    expect(actions.length).toBeGreaterThan(0);
    // No accidental camelCase / web-local action authority leaking onto the wire.
    for (const action of actions) {
      expect(action).not.toMatch(/[A-Z]/);
      expect(action).not.toContain("-");
    }
  });
});

function isRecordType(value: unknown, type: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type?: unknown }).type === type
  );
}
