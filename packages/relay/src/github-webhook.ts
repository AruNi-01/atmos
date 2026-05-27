import {
  dispatchExternalEventToServer,
  type ExternalDispatchResult,
} from "./event-dispatch";
import {
  insertDelivery,
  updateDeliveryDispatchStatus,
} from "./delivery-state";
import {
  findMatchingGithubRoutes,
  normalizeGithubRouteEventName,
  toGithubTriggerEnvelope,
  type NormalizedGithubEvent,
} from "./event-routes";
import type { Env } from "./index";

const SIGNATURE_PREFIX = "sha256=";
const EXCERPT_LIMIT = 4096;

export async function handleGithubWebhook(
  request: Request,
  env: Env,
): Promise<Response> {
  const webhookSecret = env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return json({ error: "github_webhook_not_configured" }, 503);
  }

  const eventName = request.headers.get("X-GitHub-Event")?.trim() ?? "";
  const deliveryId = request.headers.get("X-GitHub-Delivery")?.trim() ?? "";
  const signature = request.headers.get("X-Hub-Signature-256")?.trim() ?? "";
  if (!eventName || !deliveryId || !signature) {
    return json({ error: "invalid_github_headers" }, 400);
  }

  const rawBytes = new Uint8Array(await request.arrayBuffer());
  const valid = await verifyGithubSignature(rawBytes, signature, webhookSecret);
  if (!valid) {
    return json({ error: "invalid_signature" }, 401);
  }

  const rawBody = new TextDecoder().decode(rawBytes);
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const event = normalizeGithubEvent(eventName, deliveryId, payload);
  if (!event) {
    return json({ ok: true, ignored: true, reason: "unsupported_event" }, 202);
  }

  const routes = await findMatchingGithubRoutes(env, event);
  if (routes.length === 0) {
    return json({ ok: true, matched: 0 }, 202);
  }

  let dispatched = 0;
  let missedOffline = 0;
  let duplicates = 0;
  let errors = 0;

  for (const route of routes) {
    const inserted = await insertDelivery(env, {
      provider: "github",
      deliveryId: event.deliveryId,
      routeId: route.route_id,
      tenantId: route.tenant_id,
      serverId: route.server_id,
      automationGuid: route.automation_guid,
      eventName: event.eventName,
      action: event.action ?? null,
      repositoryFullName: event.repositoryFullName,
      receivedAt: event.receivedAt,
    });
    if (inserted.duplicate) {
      duplicates += 1;
      continue;
    }

    const triggerEnvelope = toGithubTriggerEnvelope(event, route);
    const dispatchResult = await dispatchExternalEventToServer(env, triggerEnvelope);
    await persistDispatchResult(env, event.deliveryId, route.route_id, dispatchResult);

    if (dispatchResult.status === "dispatched") {
      dispatched += 1;
    } else if (dispatchResult.status === "missed_offline") {
      missedOffline += 1;
    } else {
      errors += 1;
    }
  }

  return json(
    {
      ok: true,
      matched: routes.length,
      dispatched,
      missed_offline: missedOffline,
      duplicates,
      errors,
    },
    202,
  );
}

async function persistDispatchResult(
  env: Env,
  deliveryId: string,
  routeId: string,
  result: ExternalDispatchResult,
): Promise<void> {
  const identity = { provider: "github" as const, deliveryId, routeId };
  if (result.status === "dispatched") {
    await updateDeliveryDispatchStatus(env, identity, "dispatched", {
      dispatchedAt: result.dispatchedAt,
      errorCode: null,
    });
    return;
  }
  if (result.status === "missed_offline") {
    await updateDeliveryDispatchStatus(env, identity, "missed_offline", {
      errorCode: result.errorCode,
    });
    return;
  }
  await updateDeliveryDispatchStatus(env, identity, "error", {
    errorCode: result.errorCode,
  });
}

async function verifyGithubSignature(
  rawBody: Uint8Array,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }
  const expectedHex = signatureHeader.slice(SIGNATURE_PREFIX.length);
  if (!/^[a-f0-9]{64}$/i.test(expectedHex)) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    rawBody,
  );
  return timingSafeEqual(hexToBytes(expectedHex), new Uint8Array(digest));
}

export function normalizeGithubEvent(
  eventName: string,
  deliveryId: string,
  payload: Record<string, unknown>,
): NormalizedGithubEvent | null {
  const routeEventName = normalizeGithubRouteEventName(eventName);
  if (!routeEventName) {
    return null;
  }

  const installation = asRecord(payload.installation);
  const repository = asRecord(payload.repository);
  const sender = asRecord(payload.sender);
  const installationId = asNumber(installation?.id);
  const repositoryFullName = asString(repository?.full_name);
  if (!installationId || !repositoryFullName) {
    return null;
  }

  const base = {
    deliveryId,
    installationId,
    repositoryId: asNumber(repository?.id),
    repositoryFullName,
    eventName: routeEventName,
    senderLogin: asString(sender?.login),
    receivedAt: Math.floor(Date.now() / 1000),
  };

  if (eventName === "pull_request") {
    const pullRequest = asRecord(payload.pull_request);
    if (!pullRequest) {
      return null;
    }
    const action = normalizePullRequestAction(
      asString(payload.action),
      asBoolean(pullRequest.merged),
    );
    return {
      ...base,
      action,
      sourceUrl: asString(pullRequest.html_url),
      pullRequestNumber: asNumber(pullRequest.number),
      branch: asString(asRecord(pullRequest.base)?.ref),
      untrustedTextExcerpt: excerpt(asString(pullRequest.body)),
    };
  }

  if (eventName === "issue_comment" || eventName === "pull_request_review_comment") {
    const issue = asRecord(payload.issue);
    const pullRequest = asRecord(payload.pull_request);
    const comment = asRecord(payload.comment);
    if (!comment) {
      return null;
    }
    const issuePr = issue ? asRecord(issue.pull_request) : null;
    if (eventName === "issue_comment" && (!issue || !issuePr)) {
      return null;
    }
    if (eventName === "pull_request_review_comment" && !pullRequest) {
      return null;
    }

    return {
      ...base,
      action: asString(payload.action) ?? undefined,
      sourceUrl: asString(comment.html_url),
      pullRequestNumber: asNumber(issue?.number) ?? asNumber(pullRequest?.number),
      branch: asString(asRecord(pullRequest?.base)?.ref),
      untrustedTextExcerpt: excerpt(asString(comment.body)),
    };
  }

  if (eventName === "push") {
    const headCommit = asRecord(payload.head_commit);
    return {
      ...base,
      action: "pushed",
      sourceUrl: asString(headCommit?.url) ?? asString(repository?.html_url),
      branch: normalizePushRef(asString(payload.ref)),
      untrustedTextExcerpt: excerpt(asString(headCommit?.message)),
    };
  }

  if (eventName === "workflow_run") {
    const workflowRun = asRecord(payload.workflow_run);
    if (!workflowRun) {
      return null;
    }
    return {
      ...base,
      action: asString(payload.action) ?? undefined,
      sourceUrl: asString(workflowRun.html_url),
      branch: asString(workflowRun.head_branch),
      workflowName: asString(workflowRun.name),
      conclusion: asString(workflowRun.conclusion),
    };
  }

  return null;
}

function normalizePullRequestAction(
  action: string | undefined,
  merged: boolean | undefined,
): string | undefined {
  if (action === "closed" && merged) {
    return "merged";
  }
  return action;
}

function normalizePushRef(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.replace(/^refs\/heads\//, "");
}

function excerpt(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.slice(0, EXCERPT_LIMIT);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
