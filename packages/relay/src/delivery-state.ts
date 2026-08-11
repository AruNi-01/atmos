import type { Env } from "./index";

export type DeliveryProvider = "github";
export type DeliveryDispatchStatus = "dispatched" | "missed_offline" | "error";
/**
 * Delivery ack from the local Atmos Server.
 *
 * Current servers (APP-051 accept-on-persist) emit only `accepted` | `error`.
 * `local_rejected` remains for historical rows / older server builds.
 */
export type DeliveryAckStatus = "accepted" | "local_rejected" | "error";

export const GITHUB_DELIVERY_LIMITS = {
  monthlyDispatches: 5_000,
} as const;

export interface DeliveryIdentity {
  provider: DeliveryProvider;
  deliveryId: string;
  routeId: string;
  serverId?: string;
}

export interface DeliveryInsert {
  provider: DeliveryProvider;
  deliveryId: string;
  routeId: string;
  userId: string;
  installationId: string;
  serverId: string;
  automationGuid: string;
  eventName: string;
  action?: string | null;
  repositoryFullName?: string | null;
  receivedAt: number;
}

export function providerFromRelayAddress(value: string | undefined): DeliveryProvider | null {
  if (value === "relay:github") {
    return "github";
  }
  return null;
}

export async function insertDelivery(
  env: Env,
  delivery: DeliveryInsert,
): Promise<{ duplicate: boolean }> {
  assertGithubProvider(delivery.provider);

  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO github_webhook_deliveries(
       delivery_id, route_id, user_id, installation_id, server_id, automation_guid,
       event_name, action, repository_full_name, status, duplicate_count,
       received_at, dispatched_at, error_code
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'matched', 0, ?, NULL, NULL)`,
  )
    .bind(
      delivery.deliveryId,
      delivery.routeId,
      delivery.userId,
      delivery.installationId,
      delivery.serverId,
      delivery.automationGuid,
      delivery.eventName,
      delivery.action ?? null,
      delivery.repositoryFullName ?? null,
      delivery.receivedAt,
    )
    .run();

  if (inserted.meta.changes) {
    return { duplicate: false };
  }

  await env.DB.prepare(
    `UPDATE github_webhook_deliveries
     SET duplicate_count = duplicate_count + 1
     WHERE delivery_id = ? AND route_id = ?`,
  )
    .bind(delivery.deliveryId, delivery.routeId)
    .run();
  return { duplicate: true };
}

export async function githubMonthlyDispatchLimitExceeded(
  env: Env,
  route: { user_id: string; installation_id: string },
  now: number,
): Promise<string | null> {
  const monthStart = utcMonthStartSeconds(now);
  const tenantDispatches = await countGithubWebhookDeliveries(
    env,
    "user_id = ? AND received_at >= ?",
    [route.user_id, monthStart],
  );
  if (tenantDispatches >= GITHUB_DELIVERY_LIMITS.monthlyDispatches) {
    return "github_trigger_monthly_limit_exceeded";
  }

  const installationDispatches = await countGithubWebhookDeliveries(
    env,
    "installation_id = ? AND received_at >= ?",
    [route.installation_id, monthStart],
  );
  if (installationDispatches >= GITHUB_DELIVERY_LIMITS.monthlyDispatches) {
    return "github_trigger_installation_monthly_limit_exceeded";
  }

  return null;
}

export async function updateDeliveryDispatchStatus(
  env: Env,
  identity: DeliveryIdentity,
  status: DeliveryDispatchStatus,
  options: { dispatchedAt?: number; errorCode?: string | null } = {},
): Promise<void> {
  assertGithubProvider(identity.provider);

  await env.DB.prepare(
    `UPDATE github_webhook_deliveries
     SET status = ?, dispatched_at = COALESCE(?, dispatched_at), error_code = ?
     WHERE delivery_id = ? AND route_id = ? AND status = 'matched'`,
  )
    .bind(
      status,
      options.dispatchedAt ?? null,
      options.errorCode ?? null,
      identity.deliveryId,
      identity.routeId,
    )
    .run();
}

export async function ackDelivery(
  env: Env,
  identity: DeliveryIdentity,
  status: DeliveryAckStatus,
  errorCode: string | null = null,
): Promise<void> {
  assertGithubProvider(identity.provider);

  const serverFilter = identity.serverId ? " AND server_id = ?" : "";
  const args: unknown[] = [
    status,
    errorCode,
    identity.deliveryId,
    identity.routeId,
  ];
  if (identity.serverId) {
    args.push(identity.serverId);
  }

  await env.DB.prepare(
    `UPDATE github_webhook_deliveries
     SET status = ?, error_code = ?
     WHERE delivery_id = ? AND route_id = ? AND status IN ('matched', 'dispatched')${serverFilter}`,
  )
    .bind(...args)
    .run();
}

function assertGithubProvider(provider: DeliveryProvider): void {
  if (provider !== "github") {
    throw new Error("unsupported_delivery_provider");
  }
}

async function countGithubWebhookDeliveries(
  env: Env,
  predicate: string,
  args: unknown[],
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM github_webhook_deliveries WHERE ${predicate}`,
  )
    .bind(...args)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

function utcMonthStartSeconds(now: number): number {
  const date = new Date(now * 1000);
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
}
