import { describe, expect, test } from "bun:test";
import {
  dispatchExternalEventToServer,
  type GithubTriggerEnvelope,
} from "../src/event-dispatch";

const event: GithubTriggerEnvelope = {
  delivery_id: "delivery_1",
  route_id: "route_1",
  tenant_id: "tenant_1",
  server_id: "server_1",
  automation_guid: "automation_1",
  provider: "github",
  installation_id: "1",
  repository_id: "100",
  repository_full_name: "Atmos/Repo",
  event_name: "pull_request",
  action: "opened",
  received_at: 1,
};

describe("external event dispatch", () => {
  test("maps Durable Object fetch exceptions to dispatch_failed", async () => {
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      const result = await dispatchExternalEventToServer({
        SERVER_HUB: {
          idFromName: () => "server_1",
          get: () => ({
            fetch: async () => {
              throw new Error("durable object unavailable");
            },
          }),
        },
      } as never, event);

      expect(result).toEqual({ status: "error", errorCode: "dispatch_failed" });
    } finally {
      console.warn = warn;
    }
  });
});
