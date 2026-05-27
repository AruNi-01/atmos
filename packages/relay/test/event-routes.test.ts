import { describe, expect, test } from "bun:test";
import {
  ackDelivery,
  updateDeliveryDispatchStatus,
} from "../src/delivery-state";
import {
  claimGithubSetupSession,
  findMatchingGithubRoutes,
  getGithubSetupSession,
  routeMatchesEvent,
  type GithubEventRoute,
  type NormalizedGithubEvent,
} from "../src/event-routes";
import { parseGithubNextPath } from "../src/github-app";
import { normalizeGithubEvent } from "../src/github-webhook";

function baseRoute(overrides: Partial<GithubEventRoute> = {}): GithubEventRoute {
  return {
    route_id: "route_1",
    tenant_id: "tenant_1",
    server_id: "server_1",
    automation_guid: "automation_1",
    installation_id: "1",
    repository_id: "100",
    repository_full_name: "Atmos/Repo",
    event_name: "pull_request",
    action: "opened",
    filters_json: "{}",
    ...overrides,
  };
}

function baseEvent(overrides: Partial<NormalizedGithubEvent> = {}): NormalizedGithubEvent {
  return {
    deliveryId: "delivery_1",
    installationId: "1",
    repositoryId: "100",
    repositoryFullName: "Atmos/Repo",
    eventName: "pull_request",
    action: "opened",
    senderLogin: "Aaryn",
    receivedAt: 1,
    ...overrides,
  };
}

function captureDbEnv() {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  return {
    calls,
    env: {
      DB: {
        prepare(sql: string) {
          return {
            bind(...args: unknown[]) {
              calls.push({ sql, args });
              return {
                async run() {
                  return { meta: { changes: 1 } };
                },
              };
            },
          };
        },
      },
    },
  };
}

function captureQueryEnv(options: {
  results?: unknown[];
  first?: unknown;
  changes?: number;
} = {}) {
  const calls: Array<{ sql: string; args: unknown[]; op?: "run" | "first" | "all" }> = [];
  return {
    calls,
    env: {
      DB: {
        prepare(sql: string) {
          return {
            bind(...args: unknown[]) {
              const call: {
                sql: string;
                args: unknown[];
                op?: "run" | "first" | "all";
              } = { sql, args };
              calls.push(call);
              return {
                async run() {
                  call.op = "run";
                  return { meta: { changes: options.changes ?? 1 } };
                },
                async first() {
                  call.op = "first";
                  return options.first ?? null;
                },
                async all() {
                  call.op = "all";
                  return { results: options.results ?? [] };
                },
              };
            },
          };
        },
      },
    },
  };
}

describe("GitHub event routes", () => {
  test("matches sender logins and workflow conclusions case-insensitively", () => {
    const route = baseRoute({
      event_name: "workflow_run",
      action: "completed",
      filters_json: JSON.stringify({
        sender_logins: ["aaryn"],
        conclusions: ["SUCCESS"],
      }),
    });
    const event = baseEvent({
      eventName: "workflow_run",
      action: "completed",
      senderLogin: "Aaryn",
      conclusion: "success",
    });

    expect(routeMatchesEvent(route, event)).toBe(true);
  });

  test("does not treat plain closed routes as merged close events", () => {
    const route = baseRoute({ action: "closed" });
    const event = baseEvent({ action: "merged" });

    expect(routeMatchesEvent(route, event)).toBe(false);
  });

  test("supports explicit pull_request merged routes", () => {
    const route = baseRoute({ action: "merged" });
    const event = baseEvent({ action: "merged" });

    expect(routeMatchesEvent(route, event)).toBe(true);
  });

  test("matches repository id before full name so repo renames still route", () => {
    const route = baseRoute({ repository_full_name: "Atmos/OldName" });
    const event = baseEvent({ repositoryFullName: "Atmos/NewName" });

    expect(routeMatchesEvent(route, event)).toBe(true);
  });

  test("uses full name only as repository fallback", () => {
    const route = baseRoute({
      repository_id: null,
      repository_full_name: "Atmos/Renamed",
    });

    expect(routeMatchesEvent(route, baseEvent({
      repositoryId: "200",
      repositoryFullName: "Atmos/Renamed",
    }))).toBe(true);
    expect(routeMatchesEvent(route, baseEvent({
      repositoryId: "200",
      repositoryFullName: "Atmos/Other",
    }))).toBe(false);
  });

  test("route query fetches repository id matches and full-name fallback routes", async () => {
    const route = baseRoute({ repository_full_name: "Atmos/OldName" });
    const { env, calls } = captureQueryEnv({ results: [route] });

    const matches = await findMatchingGithubRoutes(env as never, baseEvent({
      repositoryFullName: "Atmos/NewName",
    }));

    expect(matches).toHaveLength(1);
    expect(calls[0]?.sql).toContain("repository_id = ?");
    expect(calls[0]?.sql).toContain("repository_id IS NULL AND repository_full_name = ?");
    expect(calls[0]?.args).toEqual([
      "1",
      "100",
      "Atmos/NewName",
      "pull_request",
      "opened",
    ]);
  });

  test("normalizes review comments into the existing PR comment route family", () => {
    const event = normalizeGithubEvent("pull_request_review_comment", "delivery_1", {
      action: "created",
      installation: { id: 1 },
      repository: { id: 100, full_name: "Atmos/Repo" },
      sender: { login: "alice" },
      pull_request: {
        number: 42,
        base: { ref: "main" },
      },
      comment: {
        html_url: "https://github.com/Atmos/Repo/pull/42#discussion_r1",
        body: "/atmos review this diff",
      },
    });

    expect(event?.eventName).toBe("issue_comment");
    expect(event?.action).toBe("created");
    expect(event?.pullRequestNumber).toBe(42);
    expect(event?.untrustedTextExcerpt).toContain("/atmos review");
  });

  test("setup session read is non-mutating before final claim", async () => {
    const { env, calls } = captureQueryEnv({
      first: {
        tenant_id: "tenant_1",
        server_id: "server_1",
        return_url: "https://app.atmos.land/done",
      },
      changes: 1,
    });

    const session = await getGithubSetupSession(env as never, "state_hash", 123);

    expect(session?.tenant_id).toBe("tenant_1");
    expect(calls[0]?.sql).toContain("SELECT tenant_id, server_id, return_url");
    expect(calls[0]?.sql).toContain("used_at IS NULL AND expires_at > ?");
    expect(calls[0]?.args).toEqual(["state_hash", 123]);
    expect(calls[0]?.op).toBe("first");
  });

  test("setup session final claim is atomic after setup succeeds", async () => {
    const { env, calls } = captureQueryEnv({
      first: {
        tenant_id: "tenant_1",
        server_id: "server_1",
        return_url: "https://app.atmos.land/done",
      },
      changes: 1,
    });

    const session = await claimGithubSetupSession(env as never, "state_hash", 123, {
      tenant_id: "tenant_1",
      server_id: "server_1",
      return_url: "https://app.atmos.land/done",
    });

    expect(session?.tenant_id).toBe("tenant_1");
    expect(calls[0]?.sql).toContain("SET used_at = ?");
    expect(calls[0]?.sql).toContain("used_at IS NULL");
    expect(calls[0]?.sql).toContain("expires_at > ?");
    expect(calls[0]?.sql).toContain("tenant_id = ?");
    expect(calls[0]?.args).toEqual([123, "state_hash", 123, "tenant_1", "server_1"]);
    expect(calls[0]?.op).toBe("run");
    expect(calls[1]?.op).toBe("first");
  });

  test("delivery ack updates are accepted from matched or dispatched only", async () => {
    const { env, calls } = captureDbEnv();

    await ackDelivery(
      env as never,
      { provider: "github", deliveryId: "delivery_1", routeId: "route_1" },
      "accepted",
      null,
    );

    expect(calls[0]?.sql).toContain("status IN ('matched', 'dispatched')");
    expect(calls[0]?.args).toEqual(["accepted", null, "delivery_1", "route_1"]);
  });

  test("delivery dispatch status update cannot overwrite a terminal ack", async () => {
    const { env, calls } = captureDbEnv();

    await updateDeliveryDispatchStatus(
      env as never,
      { provider: "github", deliveryId: "delivery_1", routeId: "route_1" },
      "dispatched",
      { dispatchedAt: 123 },
    );

    expect(calls[0]?.sql).toContain("status = 'matched'");
    expect(calls[0]?.args).toEqual([
      "dispatched",
      123,
      null,
      "delivery_1",
      "route_1",
    ]);
  });
});

describe("GitHub pagination", () => {
  test("extracts GitHub rel=next links as API paths", () => {
    const next = parseGithubNextPath(
      '<https://api.github.com/installation/repositories?per_page=100&page=11>; rel="next", <https://api.github.com/installation/repositories?per_page=100&page=12>; rel="last"',
    );

    expect(next).toBe("/installation/repositories?per_page=100&page=11");
  });
});
