import { describe, expect, test } from "bun:test";
import {
  ackDelivery,
  GITHUB_DELIVERY_LIMITS,
  githubMonthlyDispatchLimitExceeded,
  insertDelivery,
  updateDeliveryDispatchStatus,
} from "../src/delivery-state";
import {
  claimGithubSetupSession,
  findMatchingGithubRoutes,
  getGithubSetupSession,
  GITHUB_ROUTE_LIMITS,
  listGithubInstallations,
  routeMatchesEvent,
  validateGithubEventRouteLimits,
  validateGithubEventRoutePolicy,
  type GithubEventRoute,
  type NormalizedGithubEvent,
} from "../src/event-routes";
import { parseGithubNextPath } from "../src/github-app";
import { githubWebhookFanoutLimit, normalizeGithubEvent } from "../src/github-webhook";

function baseRoute(overrides: Partial<GithubEventRoute> = {}): GithubEventRoute {
  return {
    route_id: "route_1",
    user_id: "tenant_1",
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
  first?: unknown | (() => unknown);
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
                  return typeof options.first === "function"
                    ? options.first()
                    : options.first ?? null;
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

  test("matches issue label filters case-insensitively", () => {
    const route = baseRoute({
      event_name: "issues",
      action: "labeled",
      filters_json: JSON.stringify({ label: "Atmos-Judge-Approve" }),
    });
    const event = baseEvent({
      eventName: "issues",
      action: "labeled",
      issueNumber: 42,
      labelName: "atmos-judge-approve",
    });

    expect(routeMatchesEvent(route, event)).toBe(true);
    expect(routeMatchesEvent(route, { ...event, labelName: "bug" })).toBe(false);
  });

  test("matches issue opened routes without label filters", () => {
    const route = baseRoute({
      event_name: "issues",
      action: "opened",
      filters_json: "{}",
    });
    const event = baseEvent({
      eventName: "issues",
      action: "opened",
      issueNumber: 42,
    });

    expect(routeMatchesEvent(route, event)).toBe(true);
  });

  test("matches workflow run routes by workflow name", () => {
    const route = baseRoute({
      event_name: "workflow_run",
      action: "completed",
      filters_json: JSON.stringify({
        workflow_name: "CI",
        conclusions: ["failure"],
      }),
    });
    const event = baseEvent({
      eventName: "workflow_run",
      action: "completed",
      workflowName: "CI",
      conclusion: "failure",
    });

    expect(routeMatchesEvent(route, event)).toBe(true);
    expect(routeMatchesEvent(route, { ...event, workflowName: "Release" })).toBe(false);
  });

  test("requires issue comment routes to name at least one GitHub sender", () => {
    expect(validateGithubEventRoutePolicy("issue_comment", "created", {})).toBe(
      "github_trigger_comment_sender_required",
    );
    expect(validateGithubEventRoutePolicy("issue_comment", "created", {
      sender_logins: ["*"],
    })).toBe("github_trigger_comment_sender_required");
    expect(validateGithubEventRoutePolicy("issue_comment", "created", {
      sender_logins: ["Alice", "dependabot[bot]"],
    })).toBeNull();
  });

  test("requires push routes to include a concrete branch filter", () => {
    expect(validateGithubEventRoutePolicy("push", null, {})).toBe(
      "github_trigger_push_branch_required",
    );
    expect(validateGithubEventRoutePolicy("push", null, { branch: "*" })).toBe(
      "github_trigger_push_branch_required",
    );
    expect(validateGithubEventRoutePolicy("push", null, { branch: "main" })).toBeNull();
    expect(validateGithubEventRoutePolicy("push", null, { branches: ["release/*"] })).toBeNull();
  });

  test("does not require a comment prefix for issue comment routes", () => {
    expect(validateGithubEventRoutePolicy("issue_comment", "created", {
      sender_logins: ["alice"],
    })).toBeNull();
  });

  test("matches any configured comment contains token", () => {
    const route = baseRoute({
      event_name: "issue_comment",
      action: "created",
      filters_json: JSON.stringify({
        comment_contains_any: ["/atmos fix", "/atmos review"],
        sender_logins: ["alice"],
      }),
    });
    const event = baseEvent({
      eventName: "issue_comment",
      action: "created",
      senderLogin: "alice",
      untrustedTextExcerpt: "/atmos review this pull request",
    });

    expect(routeMatchesEvent(route, event)).toBe(true);
    expect(routeMatchesEvent(route, {
      ...event,
      untrustedTextExcerpt: "/not-atmos",
    })).toBe(false);
  });

  test("rejects low-value issue assigned and edited actions", () => {
    expect(validateGithubEventRoutePolicy("issues", "assigned", {})).toBe(
      "github_trigger_action_invalid",
    );
    expect(validateGithubEventRoutePolicy("issues", "edited", {})).toBe(
      "github_trigger_action_invalid",
    );
    expect(validateGithubEventRoutePolicy("issues", "opened", {})).toBeNull();
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
      "active",
      "opened",
    ]);
  });

  test("blocks new routes once a user reaches the total route limit", async () => {
    const counts = [{ count: GITHUB_ROUTE_LIMITS.userTotal }];
    const { env, calls } = captureQueryEnv({ first: () => counts.shift() ?? { count: 0 } });

    const error = await validateGithubEventRouteLimits(env as never, {
      userId: "tenant_1",
      routeId: "route_1",
      installationId: "installation_1",
      enabled: 1,
      routeExists: false,
    });

    expect(error).toBe("github_trigger_total_limit_exceeded");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("COUNT(*)");
    expect(calls[0]?.args).toEqual(["tenant_1"]);
  });

  test("blocks active routes once a user reaches the active route limit", async () => {
    const counts = [
      { count: 0 },
      { count: GITHUB_ROUTE_LIMITS.userActive },
    ];
    const { env, calls } = captureQueryEnv({ first: () => counts.shift() ?? { count: 0 } });

    const error = await validateGithubEventRouteLimits(env as never, {
      userId: "tenant_1",
      routeId: "route_1",
      installationId: "installation_1",
      enabled: 1,
      routeExists: false,
    });

    expect(error).toBe("github_trigger_active_limit_exceeded");
    expect(calls).toHaveLength(2);
    expect(calls[1]?.args).toEqual(["tenant_1", "active", "route_1"]);
  });

  test("blocks active routes once an installation reaches the active route limit", async () => {
    const counts = [
      { count: 0 },
      { count: 0 },
      { count: GITHUB_ROUTE_LIMITS.installationActive },
    ];
    const { env, calls } = captureQueryEnv({ first: () => counts.shift() ?? { count: 0 } });

    const error = await validateGithubEventRouteLimits(env as never, {
      userId: "tenant_1",
      routeId: "route_1",
      installationId: "installation_1",
      enabled: 1,
      routeExists: false,
    });

    expect(error).toBe("github_trigger_installation_active_limit_exceeded");
    expect(calls).toHaveLength(3);
    expect(calls[2]?.args).toEqual(["installation_1", "active", "route_1"]);
  });

  test("does not count disabled routes against active route limits", async () => {
    const counts = [{ count: 0 }];
    const { env, calls } = captureQueryEnv({ first: () => counts.shift() ?? { count: 0 } });

    const error = await validateGithubEventRouteLimits(env as never, {
      userId: "tenant_1",
      routeId: "route_1",
      installationId: "installation_1",
      enabled: 0,
      routeExists: false,
    });

    expect(error).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual(["tenant_1"]);
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

  test("normalizes ordinary issue events", () => {
    const event = normalizeGithubEvent("issues", "delivery_1", {
      action: "labeled",
      installation: { id: 1 },
      repository: { id: 100, full_name: "Atmos/Repo" },
      sender: { login: "alice" },
      issue: {
        number: 42,
        html_url: "https://github.com/Atmos/Repo/issues/42",
        title: "Implement issue automation",
        body: "Run from a trusted issue label.",
      },
      label: { name: "atmos-judge-approve" },
    });

    expect(event?.eventName).toBe("issues");
    expect(event?.action).toBe("labeled");
    expect(event?.issueNumber).toBe(42);
    expect(event?.labelName).toBe("atmos-judge-approve");
    expect(event?.sourceUrl).toBe("https://github.com/Atmos/Repo/issues/42");
    expect(event?.untrustedTextExcerpt).toContain("Implement issue automation");
  });

  test("ignores low-value issue assigned and edited webhook actions", () => {
    const basePayload = {
      installation: { id: 1 },
      repository: { id: 100, full_name: "Atmos/Repo" },
      sender: { login: "alice" },
      issue: {
        number: 42,
        html_url: "https://github.com/Atmos/Repo/issues/42",
        title: "Implement issue automation",
      },
    };

    expect(normalizeGithubEvent("issues", "delivery_1", {
      ...basePayload,
      action: "assigned",
    })).toBeNull();
    expect(normalizeGithubEvent("issues", "delivery_2", {
      ...basePayload,
      action: "edited",
    })).toBeNull();
  });

  test("setup session read is non-mutating before final claim", async () => {
    const { env, calls } = captureQueryEnv({
      first: {
        user_id: "tenant_1",
        server_id: "server_1",
        return_url: "https://app.atmos.land/done",
      },
      changes: 1,
    });

    const session = await getGithubSetupSession(env as never, "state_hash", 123);

    expect(session?.user_id).toBe("tenant_1");
    expect(calls[0]?.sql).toContain("SELECT user_id, server_id, return_url");
    expect(calls[0]?.sql).toContain("used_at IS NULL AND expires_at > ?");
    expect(calls[0]?.args).toEqual(["state_hash", 123]);
    expect(calls[0]?.op).toBe("first");
  });

  test("setup session final claim is atomic after setup succeeds", async () => {
    const { env, calls } = captureQueryEnv({
      first: {
        user_id: "tenant_1",
        server_id: "server_1",
        return_url: "https://app.atmos.land/done",
      },
      changes: 1,
    });

    const session = await claimGithubSetupSession(env as never, "state_hash", 123, {
      user_id: "tenant_1",
      server_id: "server_1",
      return_url: "https://app.atmos.land/done",
    });

    expect(session?.user_id).toBe("tenant_1");
    expect(calls[0]?.sql).toContain("SET used_at = ?");
    expect(calls[0]?.sql).toContain("used_at IS NULL");
    expect(calls[0]?.sql).toContain("expires_at > ?");
    expect(calls[0]?.sql).toContain("user_id = ?");
    expect(calls[0]?.args).toEqual([123, "state_hash", 123, "tenant_1", "server_1"]);
    expect(calls[0]?.op).toBe("run");
    expect(calls[1]?.op).toBe("first");
  });

  test("installation list hides stale duplicate account rows", async () => {
    const { env } = captureQueryEnv({
      results: [
        {
          installation_id: "new_installation",
          account_login: "AruNi-01",
          account_type: "User",
          repository_selection: "all",
          suspended_at: null,
          created_at: 200,
          updated_at: 200,
        },
        {
          installation_id: "old_installation",
          account_login: "AruNi-01",
          account_type: "User",
          repository_selection: "all",
          suspended_at: null,
          created_at: 100,
          updated_at: 100,
        },
      ],
    });

    const response = await listGithubInstallations(env as never, "tenant_1");
    const data = await response.json() as {
      installations: Array<{ installation_id: string }>;
    };

    expect(data.installations.map((installation) => installation.installation_id)).toEqual([
      "new_installation",
    ]);
  });

  test("monthly dispatch limit blocks user dispatches first", async () => {
    const now = Math.floor(Date.UTC(2026, 5, 24, 12, 0, 0) / 1000);
    const monthStart = Math.floor(Date.UTC(2026, 5, 1, 0, 0, 0) / 1000);
    const counts = [{ count: GITHUB_DELIVERY_LIMITS.monthlyDispatches }];
    const { env, calls } = captureQueryEnv({ first: () => counts.shift() ?? { count: 0 } });

    const error = await githubMonthlyDispatchLimitExceeded(
      env as never,
      { user_id: "tenant_1", installation_id: "installation_1" },
      now,
    );

    expect(error).toBe("github_trigger_monthly_limit_exceeded");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual(["tenant_1", monthStart]);
  });

  test("monthly dispatch limit blocks installation dispatches after user room remains", async () => {
    const now = Math.floor(Date.UTC(2026, 5, 24, 12, 0, 0) / 1000);
    const monthStart = Math.floor(Date.UTC(2026, 5, 1, 0, 0, 0) / 1000);
    const counts = [
      { count: 0 },
      { count: GITHUB_DELIVERY_LIMITS.monthlyDispatches },
    ];
    const { env, calls } = captureQueryEnv({ first: () => counts.shift() ?? { count: 0 } });

    const error = await githubMonthlyDispatchLimitExceeded(
      env as never,
      { user_id: "tenant_1", installation_id: "installation_1" },
      now,
    );

    expect(error).toBe("github_trigger_installation_monthly_limit_exceeded");
    expect(calls).toHaveLength(2);
    expect(calls[1]?.args).toEqual(["installation_1", monthStart]);
  });

  test("GitHub webhook fan-out limit is fixed at twenty matched routes", () => {
    expect(githubWebhookFanoutLimit()).toBe(20);
  });

  test("delivery insert records the installation dimension for monthly limits", async () => {
    const { env, calls } = captureDbEnv();

    await insertDelivery(env as never, {
      provider: "github",
      deliveryId: "delivery_1",
      routeId: "route_1",
      userId: "tenant_1",
      installationId: "installation_1",
      serverId: "server_1",
      automationGuid: "automation_1",
      eventName: "issue_comment",
      action: "created",
      repositoryFullName: "Atmos/Repo",
      receivedAt: 123,
    });

    expect(calls[0]?.sql).toContain("installation_id");
    expect(calls[0]?.args).toEqual([
      "delivery_1",
      "route_1",
      "tenant_1",
      "installation_1",
      "server_1",
      "automation_1",
      "issue_comment",
      "created",
      "Atmos/Repo",
      123,
    ]);
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

  test("delivery ack can be scoped to connected server", async () => {
    const { env, calls } = captureDbEnv();

    await ackDelivery(
      env as never,
      {
        provider: "github",
        deliveryId: "delivery_1",
        routeId: "route_1",
        serverId: "server_1",
      },
      "accepted",
      null,
    );

    expect(calls[0]?.sql).toContain("server_id = ?");
    expect(calls[0]?.args).toEqual(["accepted", null, "delivery_1", "route_1", "server_1"]);
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
