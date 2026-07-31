import { expect, test } from "../../../fixtures/test";
import {
  connectLocalComputer,
  stubComputerClientSettingsApi,
} from "../support/app-smoke";
import {
  attachAppWsObserver,
  isWsRequestEnvelope,
  isWsResponseEnvelope,
  listInboundResponses,
  listOutboundActions,
  openAppWsSessions,
} from "../support/ws-session-observe";

/**
 * Smoke gate for APP-048/049 web cutover: local connect must open main `/ws`
 * and exchange at least one request/response envelope via the app session.
 */
test.describe("smoke app shell WS session", () => {
  test("@smoke @stateful local connect opens main /ws with request/response traffic", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const sessions = attachAppWsObserver(page);
    await stubComputerClientSettingsApi(page);
    await connectLocalComputer(page);

    await expect(page.getByRole("button", { name: /Search/ })).toBeVisible({
      timeout: 45_000,
    });

    await expect
      .poll(() => openAppWsSessions(sessions).length, { timeout: 45_000 })
      .toBeGreaterThan(0);

    await expect
      .poll(() => listOutboundActions(sessions).length, { timeout: 60_000 })
      .toBeGreaterThan(0);

    await expect
      .poll(() => listInboundResponses(sessions).length, { timeout: 60_000 })
      .toBeGreaterThan(0);

    const open = openAppWsSessions(sessions);
    expect(open[0]!.url).toMatch(/\/ws/);

    const hasRequest = sessions
      .flatMap((session) => session.frames)
      .some((frame) => frame.direction === "out" && isWsRequestEnvelope(frame.parsed));
    const hasResponse = sessions
      .flatMap((session) => session.frames)
      .some((frame) => frame.direction === "in" && isWsResponseEnvelope(frame.parsed));

    expect(hasRequest).toBe(true);
    expect(hasResponse).toBe(true);
    expect(listInboundResponses(sessions).some((r) => r.success)).toBe(true);
  });
});
