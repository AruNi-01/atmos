import type { GithubTriggerEnvelope } from "./event-dispatch";
import {
  completeGithubInstallationSetup,
  githubAppInstallUrl,
  listInstallationRepositories,
  type GithubInstallationRecord,
} from "./github-app";
import type { Env } from "./index";

const SETUP_SESSION_TTL_SEC = 10 * 60;
const MIN_SETUP_TOKEN_BYTES = 32;
const SUPPORTED_EVENTS = new Set([
  "pull_request",
  "issue_comment",
  "push",
  "workflow_run",
]);

export interface NormalizedGithubEvent {
  deliveryId: string;
  installationId: number;
  repositoryId?: number;
  repositoryFullName: string;
  eventName: string;
  action?: string;
  senderLogin?: string;
  sourceUrl?: string;
  pullRequestNumber?: number;
  branch?: string;
  workflowName?: string;
  conclusion?: string;
  untrustedTextExcerpt?: string;
  receivedAt: number;
}

export interface GithubEventRoute {
  route_id: string;
  tenant_id: string;
  server_id: string;
  automation_guid: string;
  installation_id: number;
  repository_id: number | null;
  repository_full_name: string;
  event_name: string;
  action: string | null;
  filters_json: string;
}

interface RouteFilters {
  branch?: string;
  branches?: string[];
  comment_contains?: string;
  sender_logins?: string[];
  conclusions?: string[];
  conclusion?: string;
  workflow_name?: string;
}

export interface GithubSetupSessionClaim {
  tenant_id: string;
  server_id: string;
  return_url: string | null;
}

export function normalizeGithubRouteEventName(value: string | undefined): string | null {
  const eventName = value?.trim();
  if (!eventName) {
    return null;
  }
  if (eventName === "pull_request_review_comment") {
    return "issue_comment";
  }
  return SUPPORTED_EVENTS.has(eventName) ? eventName : null;
}

export async function createGithubSetupSession(
  request: Request,
  env: Env,
  url: URL,
  tenantId: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    server_id?: string;
    return_url?: string;
  } | null;
  const serverId = body?.server_id?.trim();
  if (!serverId) {
    return json({ error: "server_id_required" }, 400);
  }

  const computer = await env.DB.prepare(
    `SELECT 1 AS ok FROM computers
     WHERE tenant_id = ? AND server_id = ? AND revoked = 0 LIMIT 1`,
  )
    .bind(tenantId, serverId)
    .first<{ ok: number }>();
  if (!computer) {
    return json({ error: "computer_not_found" }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SETUP_SESSION_TTL_SEC;
  const setupToken = randomBase64Url(MIN_SETUP_TOKEN_BYTES);
  const setupTokenHash = await sha256Hex(setupToken);
  const returnUrl = normalizeReturnUrl(body?.return_url, url.origin);

  let installUrl: string;
  try {
    installUrl = githubAppInstallUrl(env, setupToken);
  } catch (error) {
    return json({ error: githubErrorCode(error) }, 503);
  }

  await env.DB.prepare(
    `INSERT INTO github_setup_sessions(setup_token_hash, tenant_id, server_id, return_url, expires_at, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  )
    .bind(setupTokenHash, tenantId, serverId, returnUrl, expiresAt, now)
    .run();

  return json({
    install_url: installUrl,
    expires_at: expiresAt,
    server_id: serverId,
  });
}

export async function handleGithubCallback(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const state = url.searchParams.get("state")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const installationId = Number(url.searchParams.get("installation_id"));
  if (!state || !code || !Number.isSafeInteger(installationId)) {
    return json({ error: "invalid_github_callback" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const setupTokenHash = await sha256Hex(state);
  const session = await claimGithubSetupSession(env, setupTokenHash, now);

  if (!session) {
    return json({ error: "setup_session_invalid_or_expired" }, 400);
  }

  let installation: GithubInstallationRecord;
  try {
    installation = await completeGithubInstallationSetup(env, code, installationId);
  } catch (error) {
    return json({ error: githubErrorCode(error) }, 400);
  }

  try {
    await persistGithubInstallation(env, session.tenant_id, installation, now);
  } catch (error) {
    return json({ error: githubErrorCode(error) }, 409);
  }

  const redirectUrl = new URL(session.return_url ?? url.origin);
  redirectUrl.searchParams.set("github_setup", "connected");
  redirectUrl.searchParams.set("installation_id", String(installationId));
  return Response.redirect(redirectUrl.toString(), 302);
}

export async function listGithubInstallations(
  env: Env,
  tenantId: string,
): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT installation_id, account_login, account_type, repository_selection, suspended_at, created_at, updated_at
     FROM github_app_installations
     WHERE tenant_id = ?
     ORDER BY updated_at DESC`,
  )
    .bind(tenantId)
    .all<{
      installation_id: number;
      account_login: string | null;
      account_type: string | null;
      repository_selection: string;
      suspended_at: number | null;
      created_at: number;
      updated_at: number;
    }>();

  return json({ installations: results ?? [] });
}

export async function listGithubInstallationRepositories(
  env: Env,
  tenantId: string,
  installationId: number,
): Promise<Response> {
  const installation = await findTenantInstallation(env, tenantId, installationId);
  if (!installation) {
    return json({ error: "installation_not_found" }, 404);
  }

  try {
    const repositories = await listInstallationRepositories(env, installationId);
    return json({ repositories });
  } catch (error) {
    return json({ error: githubErrorCode(error) }, 502);
  }
}

export async function upsertGithubEventRoute(
  request: Request,
  env: Env,
  tenantId: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    route_id?: string;
    server_id?: string;
    automation_guid?: string;
    installation_id?: number;
    repository_id?: number | null;
    repository_full_name?: string;
    event_name?: string;
    action?: string | null;
    filters?: Record<string, unknown>;
    enabled?: boolean;
  } | null;

  const serverId = body?.server_id?.trim();
  const automationGuid = body?.automation_guid?.trim();
  const installationId = Number(body?.installation_id);
  let repositoryFullName = body?.repository_full_name?.trim() ?? "";
  const eventName = normalizeGithubRouteEventName(body?.event_name);
  const action = normalizeRouteAction(eventName, body?.action);
  const routeId = body?.route_id?.trim() || `route_${randomBase64Url(18)}`;
  const filters = body?.filters && typeof body.filters === "object"
    ? normalizeRouteFilters(body.filters as Record<string, unknown>)
    : {};
  const repositoryId =
    Number.isSafeInteger(body?.repository_id) && Number(body?.repository_id) > 0
      ? Number(body?.repository_id)
      : null;

  if (
    !serverId ||
    !automationGuid ||
    !Number.isSafeInteger(installationId) ||
    !repositoryFullName ||
    !eventName
  ) {
    return json({ error: "invalid_route" }, 400);
  }

  const computer = await env.DB.prepare(
    `SELECT 1 AS ok FROM computers
     WHERE tenant_id = ? AND server_id = ? AND revoked = 0 LIMIT 1`,
  )
    .bind(tenantId, serverId)
    .first<{ ok: number }>();
  if (!computer) {
    return json({ error: "computer_not_found" }, 404);
  }

  const installation = await findTenantInstallation(env, tenantId, installationId);
  if (!installation) {
    return json({ error: "installation_not_found" }, 404);
  }

  if (!isRepositoryFullName(repositoryFullName)) {
    return json({ error: "invalid_repository" }, 400);
  }

  try {
    const repositories = await listInstallationRepositories(env, installationId);
    const matchedRepository = repositories.find((repo) => {
      if (repositoryId != null) {
        return repo.id === repositoryId;
      }
      return repo.full_name === repositoryFullName;
    });
    if (!matchedRepository) {
      return json({ error: "repository_not_in_installation" }, 400);
    }
    repositoryFullName = matchedRepository.full_name;
  } catch (error) {
    return json({ error: githubErrorCode(error) }, 502);
  }

  const now = Math.floor(Date.now() / 1000);
  const enabled = body?.enabled === false ? 0 : 1;
  const filtersJson = JSON.stringify(filters);

  const existing = await env.DB.prepare(
    "SELECT tenant_id, created_at FROM github_event_routes WHERE route_id = ? LIMIT 1",
  )
    .bind(routeId)
    .first<{ tenant_id: string; created_at: number }>();

  if (existing && existing.tenant_id !== tenantId) {
    return json({ error: "route_not_found" }, 404);
  }

  if (existing) {
    await env.DB.prepare(
      `UPDATE github_event_routes
       SET server_id = ?, automation_guid = ?, installation_id = ?, repository_id = ?,
           repository_full_name = ?, event_name = ?, action = ?, filters_json = ?,
           enabled = ?, route_status = 'active', updated_at = ?
       WHERE route_id = ? AND tenant_id = ?`,
    )
      .bind(
        serverId,
        automationGuid,
        installationId,
        repositoryId,
        repositoryFullName,
        eventName,
        action,
        filtersJson,
        enabled,
        now,
        routeId,
        tenantId,
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO github_event_routes(
         route_id, tenant_id, server_id, automation_guid, installation_id,
         repository_id, repository_full_name, event_name, action, filters_json,
         enabled, route_status, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
      .bind(
        routeId,
        tenantId,
        serverId,
        automationGuid,
        installationId,
        repositoryId,
        repositoryFullName,
        eventName,
        action,
        filtersJson,
        enabled,
        now,
        now,
      )
      .run();
  }

  return json({
    route_id: routeId,
    route_status: "active",
    enabled: enabled === 1,
  });
}

export async function disableGithubEventRoute(
  env: Env,
  tenantId: string,
  routeId: string,
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const updated = await env.DB.prepare(
    `UPDATE github_event_routes
     SET enabled = 0, route_status = 'disabled', updated_at = ?
     WHERE tenant_id = ? AND route_id = ?`,
  )
    .bind(now, tenantId, routeId)
    .run();
  if (!updated.meta.changes) {
    return json({ error: "route_not_found" }, 404);
  }
  return json({ ok: true, route_id: routeId, route_status: "disabled" });
}

export async function findMatchingGithubRoutes(
  env: Env,
  event: NormalizedGithubEvent,
): Promise<GithubEventRoute[]> {
  if (!SUPPORTED_EVENTS.has(event.eventName)) {
    return [];
  }

  const repositoryPredicate = event.repositoryId != null
    ? `AND (
         repository_id = ?
         OR (repository_id IS NULL AND repository_full_name = ?)
       )`
    : "AND repository_full_name = ?";
  const repositoryArgs = event.repositoryId != null
    ? [event.repositoryId, event.repositoryFullName]
    : [event.repositoryFullName];

  const { results } = await env.DB.prepare(
    `SELECT route_id, tenant_id, server_id, automation_guid, installation_id,
            repository_id, repository_full_name, event_name, action, filters_json
     FROM github_event_routes
     WHERE installation_id = ?
       ${repositoryPredicate}
       AND event_name = ?
       AND enabled = 1
       AND route_status = 'active'
      AND (action IS NULL OR action = ?)`,
  )
    .bind(
      event.installationId,
      ...repositoryArgs,
      event.eventName,
      event.action ?? null,
    )
    .all<GithubEventRoute>();

  return (results ?? []).filter((route) => routeMatchesEvent(route, event));
}

export async function claimGithubSetupSession(
  env: Env,
  setupTokenHash: string,
  now: number,
): Promise<GithubSetupSessionClaim | null> {
  const claimed = await env.DB.prepare(
    `UPDATE github_setup_sessions
     SET used_at = ?
     WHERE setup_token_hash = ? AND used_at IS NULL AND expires_at > ?`,
  )
    .bind(now, setupTokenHash, now)
    .run();

  if (!claimed.meta.changes) {
    return null;
  }

  return env.DB.prepare(
    `SELECT tenant_id, server_id, return_url
     FROM github_setup_sessions
     WHERE setup_token_hash = ?
     LIMIT 1`,
  )
    .bind(setupTokenHash)
    .first<GithubSetupSessionClaim>();
}

export function toGithubTriggerEnvelope(
  event: NormalizedGithubEvent,
  route: GithubEventRoute,
): GithubTriggerEnvelope {
  return {
    delivery_id: event.deliveryId,
    route_id: route.route_id,
    tenant_id: route.tenant_id,
    server_id: route.server_id,
    automation_guid: route.automation_guid,
    provider: "github",
    installation_id: event.installationId,
    repository_id: event.repositoryId,
    repository_full_name: event.repositoryFullName,
    event_name: event.eventName,
    action: event.action,
    sender_login: event.senderLogin,
    source_url: event.sourceUrl,
    pull_request_number: event.pullRequestNumber,
    branch: event.branch,
    workflow_name: event.workflowName,
    conclusion: event.conclusion,
    untrusted_text_excerpt: event.untrustedTextExcerpt,
    received_at: event.receivedAt,
  };
}

async function persistGithubInstallation(
  env: Env,
  tenantId: string,
  installation: GithubInstallationRecord,
  now: number,
): Promise<void> {
  const existing = await env.DB.prepare(
    "SELECT tenant_id FROM github_app_installations WHERE installation_id = ? LIMIT 1",
  )
    .bind(installation.installation_id)
    .first<{ tenant_id: string }>();
  if (existing && existing.tenant_id !== tenantId) {
    throw new Error("installation_already_connected");
  }

  await env.DB.prepare(
    `INSERT INTO github_app_installations(
       installation_id, tenant_id, account_login, account_type,
       repository_selection, suspended_at, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(installation_id) DO UPDATE SET
       tenant_id = excluded.tenant_id,
       account_login = excluded.account_login,
       account_type = excluded.account_type,
       repository_selection = excluded.repository_selection,
       suspended_at = excluded.suspended_at,
       updated_at = excluded.updated_at`,
  )
    .bind(
      installation.installation_id,
      tenantId,
      installation.account_login,
      installation.account_type,
      installation.repository_selection,
      installation.suspended_at,
      now,
      now,
    )
    .run();
}

async function findTenantInstallation(
  env: Env,
  tenantId: string,
  installationId: number,
): Promise<{ installation_id: number } | null> {
  return env.DB.prepare(
    `SELECT installation_id
     FROM github_app_installations
     WHERE tenant_id = ? AND installation_id = ?
     LIMIT 1`,
  )
    .bind(tenantId, installationId)
    .first<{ installation_id: number }>();
}

export function routeMatchesEvent(
  route: GithubEventRoute,
  event: NormalizedGithubEvent,
): boolean {
  if (!routeActionMatchesEvent(route, event)) {
    return false;
  }

  if (route.repository_id != null && event.repositoryId != null) {
    if (route.repository_id !== event.repositoryId) {
      return false;
    }
  } else if (route.repository_full_name !== event.repositoryFullName) {
    return false;
  }

  const filters = parseFilters(route.filters_json);
  const senderLogins = normalizeTokenArray(filters.sender_logins);
  if (
    senderLogins.length > 0 &&
    !senderLogins.some(isAny) &&
    (!event.senderLogin || !senderLogins.includes(normalizeToken(event.senderLogin)))
  ) {
    return false;
  }

  const branches = normalizeStringArray(filters.branches);
  const singleBranch = normalizeOptionalString(filters.branch);
  if (singleBranch) {
    branches.push(singleBranch);
  }
  if (branches.length > 0 && !branches.some((branch) => globMatch(branch, event.branch))) {
    return false;
  }

  const commentContains = normalizeOptionalString(filters.comment_contains);
  if (
    commentContains &&
    !event.untrustedTextExcerpt?.includes(commentContains)
  ) {
    return false;
  }

  const conclusions = normalizeTokenArray(filters.conclusions);
  const singleConclusion = normalizeTokenString(filters.conclusion);
  if (singleConclusion) {
    conclusions.push(singleConclusion);
  }
  if (
    conclusions.length > 0 &&
    !conclusions.some(isAny) &&
    (!event.conclusion || !conclusions.includes(normalizeToken(event.conclusion)))
  ) {
    return false;
  }

  const workflowName = normalizeOptionalString(filters.workflow_name);
  if (workflowName && workflowName !== event.workflowName) {
    return false;
  }

  return true;
}

function routeActionMatchesEvent(
  route: GithubEventRoute,
  event: NormalizedGithubEvent,
): boolean {
  const routeAction = normalizeTokenString(route.action);
  if (!routeAction || isAny(routeAction)) {
    return true;
  }
  const eventAction = normalizeTokenString(event.action);
  if (!eventAction) {
    return false;
  }
  return routeAction === eventAction;
}

function parseFilters(raw: string): RouteFilters {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as RouteFilters;
    }
  } catch {
    /* ignore malformed route filters */
  }
  return {};
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeTokenArray(value: unknown): string[] {
  return normalizeStringArray(value).map(normalizeToken);
}

function normalizeTokenString(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalizeToken(normalized) : null;
}

function normalizeRouteAction(
  eventName: string | null | undefined,
  value: unknown,
): string | null {
  const action = normalizeTokenString(value);
  if (!action) {
    return null;
  }
  if (eventName === "pull_request" && action === "merged") {
    return "merged";
  }
  return action;
}

function normalizeRouteFilters(filters: Record<string, unknown>): RouteFilters {
  const normalized: RouteFilters = {};
  const branch = normalizeOptionalString(filters.branch);
  if (branch) {
    normalized.branch = branch;
  }
  const branches = normalizeStringArray(filters.branches);
  if (branches.length > 0) {
    normalized.branches = branches;
  }
  const commentContains = normalizeOptionalString(filters.comment_contains);
  if (commentContains) {
    normalized.comment_contains = commentContains;
  }
  const senderLogins = normalizeTokenArray(filters.sender_logins);
  if (senderLogins.length > 0) {
    normalized.sender_logins = senderLogins;
  }
  const conclusions = normalizeTokenArray(filters.conclusions);
  if (conclusions.length > 0) {
    normalized.conclusions = conclusions;
  }
  const conclusion = normalizeTokenString(filters.conclusion);
  if (conclusion) {
    normalized.conclusion = conclusion;
  }
  const workflowName = normalizeOptionalString(filters.workflow_name);
  if (workflowName) {
    normalized.workflow_name = workflowName;
  }
  return normalized;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function isAny(value: string): boolean {
  return value === "any" || value === "*";
}

function globMatch(pattern: string, value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return pattern === value;
}

function isRepositoryFullName(value: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function normalizeReturnUrl(value: string | undefined, fallbackOrigin: string): string {
  if (!value) {
    return `${fallbackOrigin}/github/setup/complete`;
  }
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    /* ignore */
  }
  return `${fallbackOrigin}/github/setup/complete`;
}

function randomBase64Url(byteLength: number): string {
  const raw = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const b of raw) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function githubErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message === "github_app_not_configured" ||
    message === "github_oauth_not_configured"
  ) {
    return message;
  }
  if (message === "installation_not_authorized_for_user") {
    return message;
  }
  if (message === "installation_already_connected") {
    return message;
  }
  if (
    message === "github_repository_page_limit_exceeded" ||
    message === "github_installation_page_limit_exceeded"
  ) {
    return message;
  }
  return "github_request_failed";
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
