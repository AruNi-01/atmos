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
const MAX_INT64 = 9_223_372_036_854_775_807n;
const DEFAULT_SETUP_RETURN_ORIGINS = [
  "https://app.atmos.land",
  "http://localhost:3030",
  "http://127.0.0.1:3030",
];
const DEFAULT_SETUP_RETURN_URL = "https://app.atmos.land/github/setup/complete";
const SETUP_COMPLETION_PARAMS = ["github_setup", "installation_id"] as const;
const SUPPORTED_EVENTS = new Set([
  "pull_request",
  "issues",
  "issue_comment",
  "push",
  "workflow_run",
]);
const ACTIVE_ROUTE_STATUS = "active";

export const GITHUB_ROUTE_LIMITS = {
  userActive: 50,
  userTotal: 200,
  installationActive: 200,
} as const;

export interface NormalizedGithubEvent {
  deliveryId: string;
  installationId: string;
  repositoryId?: string;
  repositoryFullName: string;
  eventName: string;
  action?: string;
  senderLogin?: string;
  sourceUrl?: string;
  issueNumber?: number;
  pullRequestNumber?: number;
  branch?: string;
  workflowName?: string;
  conclusion?: string;
  labelName?: string;
  untrustedTextExcerpt?: string;
  receivedAt: number;
}

export interface GithubEventRoute {
  route_id: string;
  user_id: string;
  server_id: string;
  automation_guid: string;
  installation_id: string;
  repository_id: string | null;
  repository_full_name: string;
  event_name: string;
  action: string | null;
  filters_json: string;
}

interface RouteFilters {
  branch?: string;
  branches?: string[];
  comment_contains?: string;
  comment_contains_any?: string[];
  label?: string;
  sender_logins?: string[];
  conclusions?: string[];
  conclusion?: string;
  workflow_name?: string;
}

export interface GithubSetupSessionClaim {
  user_id: string;
  server_id: string;
  return_url: string | null;
}

export function githubSetupCompletionUrl(searchParams?: URLSearchParams): string {
  const url = new URL(DEFAULT_SETUP_RETURN_URL);
  for (const param of SETUP_COMPLETION_PARAMS) {
    const value = searchParams?.get(param);
    if (value) {
      url.searchParams.set(param, value);
    }
  }
  return url.toString();
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
  userId: string,
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
     WHERE user_id = ? AND server_id = ? AND revoked = 0 LIMIT 1`,
  )
    .bind(userId, serverId)
    .first<{ ok: number }>();
  if (!computer) {
    return json({ error: "computer_not_found" }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SETUP_SESSION_TTL_SEC;
  const setupToken = randomBase64Url(MIN_SETUP_TOKEN_BYTES);
  const setupTokenHash = await sha256Hex(setupToken);
  const returnUrl = normalizeReturnUrl(
    body?.return_url,
    url.origin,
    env.GITHUB_SETUP_RETURN_ORIGINS,
  );

  let installUrl: string;
  try {
    installUrl = githubAppInstallUrl(env, setupToken);
  } catch (error) {
    return json({ error: githubErrorCode(error) }, 503);
  }

  await env.DB.prepare(
    `INSERT INTO github_setup_sessions(setup_token_hash, user_id, server_id, return_url, expires_at, used_at, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  )
    .bind(setupTokenHash, userId, serverId, returnUrl, expiresAt, now)
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
  const installationId = normalizeInt64String(url.searchParams.get("installation_id"));
  if (!state || !code || !installationId) {
    return json({ error: "invalid_github_callback" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const setupTokenHash = await sha256Hex(state);
  const session = await getGithubSetupSession(env, setupTokenHash, now);

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
    await persistGithubInstallation(env, session.user_id, installation, now);
  } catch (error) {
    return json({ error: githubErrorCode(error) }, 409);
  }

  const claimed = await claimGithubSetupSession(env, setupTokenHash, now, session);
  if (!claimed) {
    return json({ error: "setup_session_already_used" }, 409);
  }

  const redirectUrl = new URL(session.return_url ?? url.origin);
  redirectUrl.searchParams.set("github_setup", "connected");
  redirectUrl.searchParams.set("installation_id", installationId);
  return Response.redirect(redirectUrl.toString(), 302);
}

export async function listGithubInstallations(
  env: Env,
  userId: string,
): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT installation_id, account_login, account_type, repository_selection, suspended_at, created_at, updated_at
     FROM github_app_installations
     WHERE user_id = ?
     ORDER BY updated_at DESC`,
  )
    .bind(userId)
    .all<{
      installation_id: string | number;
      account_login: string | null;
      account_type: string | null;
      repository_selection: string;
      suspended_at: number | null;
      created_at: number;
      updated_at: number;
    }>();

  const installations = dedupeGithubInstallations(results ?? []);
  return json({
    installations: installations.map((installation) => ({
      ...installation,
      installation_id: String(installation.installation_id),
    })),
  });
}

export async function listGithubInstallationRepositories(
  env: Env,
  userId: string,
  installationId: string,
): Promise<Response> {
  const installation = await findUserInstallation(env, userId, installationId);
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
  userId: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    route_id?: string;
    server_id?: string;
    automation_guid?: string;
    installation_id?: string | number;
    repository_id?: string | number | null;
    repository_full_name?: string;
    event_name?: string;
    action?: string | null;
    filters?: Record<string, unknown>;
    enabled?: boolean;
  } | null;

  const serverId = body?.server_id?.trim();
  const automationGuid = body?.automation_guid?.trim();
  const installationId = normalizeInt64String(body?.installation_id);
  let repositoryFullName = body?.repository_full_name?.trim() ?? "";
  const eventName = normalizeGithubRouteEventName(body?.event_name);
  const action = normalizeRouteAction(eventName, body?.action);
  const routeId = body?.route_id?.trim() || `route_${randomBase64Url(18)}`;
  const filters = body?.filters && typeof body.filters === "object"
    ? normalizeRouteFilters(body.filters as Record<string, unknown>)
    : {};
  const repositoryId = normalizeInt64String(body?.repository_id);

  if (
    !serverId ||
    !automationGuid ||
    !installationId ||
    !repositoryFullName ||
    !eventName
  ) {
    return json({ error: "invalid_route" }, 400);
  }
  if (
    eventName === "workflow_run" &&
    (!filters.workflow_name || isAny(normalizeToken(filters.workflow_name)))
  ) {
    return json({ error: "workflow_name_required" }, 400);
  }
  const policyError = validateRoutePolicy(eventName, action, filters);
  if (policyError) {
    return json({ error: policyError }, 400);
  }

  const computer = await env.DB.prepare(
    `SELECT 1 AS ok FROM computers
     WHERE user_id = ? AND server_id = ? AND revoked = 0 LIMIT 1`,
  )
    .bind(userId, serverId)
    .first<{ ok: number }>();
  if (!computer) {
    return json({ error: "computer_not_found" }, 404);
  }

  const installation = await findUserInstallation(env, userId, installationId);
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
    "SELECT user_id, created_at FROM github_event_routes WHERE route_id = ? LIMIT 1",
  )
    .bind(routeId)
    .first<{ user_id: string; created_at: number }>();

  if (existing && existing.user_id !== userId) {
    return json({ error: "route_not_found" }, 404);
  }
  const limitError = await validateGithubEventRouteLimits(env, {
    userId,
    routeId,
    installationId,
    enabled,
    routeExists: Boolean(existing),
  });
  if (limitError) {
    return json({ error: limitError }, 409);
  }

  if (existing) {
    await env.DB.prepare(
      `UPDATE github_event_routes
       SET server_id = ?, automation_guid = ?, installation_id = ?, repository_id = ?,
           repository_full_name = ?, event_name = ?, action = ?, filters_json = ?,
           enabled = ?, route_status = 'active', updated_at = ?
       WHERE route_id = ? AND user_id = ?`,
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
        userId,
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO github_event_routes(
         route_id, user_id, server_id, automation_guid, installation_id,
         repository_id, repository_full_name, event_name, action, filters_json,
         enabled, route_status, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
      .bind(
        routeId,
        userId,
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
  userId: string,
  routeId: string,
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const updated = await env.DB.prepare(
    `UPDATE github_event_routes
     SET enabled = 0, route_status = 'disabled', updated_at = ?
     WHERE user_id = ? AND route_id = ?`,
  )
    .bind(now, userId, routeId)
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
    `SELECT route_id, user_id, server_id, automation_guid, installation_id,
            repository_id, repository_full_name, event_name, action, filters_json
     FROM github_event_routes
     WHERE installation_id = ?
       ${repositoryPredicate}
       AND event_name = ?
       AND enabled = 1
       AND route_status = ?
       AND (action IS NULL OR action = ?)`,
  )
    .bind(
      event.installationId,
      ...repositoryArgs,
      event.eventName,
      ACTIVE_ROUTE_STATUS,
      event.action ?? null,
    )
    .all<GithubEventRoute>();

  return (results ?? []).filter((route) => routeMatchesEvent(route, event));
}

export function validateGithubEventRoutePolicy(
  eventName: string,
  action: string | null,
  filters: Record<string, unknown>,
): string | null {
  return validateRoutePolicy(eventName, action, normalizeRouteFilters(filters));
}

export async function validateGithubEventRouteLimits(
  env: Env,
  route: {
    userId: string;
    routeId: string;
    installationId: string;
    enabled: number;
    routeExists: boolean;
  },
): Promise<string | null> {
  if (!route.routeExists) {
    const total = await countGithubEventRoutes(
      env,
      "user_id = ?",
      [route.userId],
    );
    if (total >= GITHUB_ROUTE_LIMITS.userTotal) {
      return "github_trigger_total_limit_exceeded";
    }
  }

  if (route.enabled !== 1) {
    return null;
  }

  const userActive = await countGithubEventRoutes(
    env,
    `user_id = ? AND enabled = 1 AND route_status = ? AND route_id <> ?`,
    [route.userId, ACTIVE_ROUTE_STATUS, route.routeId],
  );
  if (userActive >= GITHUB_ROUTE_LIMITS.userActive) {
    return "github_trigger_active_limit_exceeded";
  }

  const installationActive = await countGithubEventRoutes(
    env,
    `installation_id = ? AND enabled = 1 AND route_status = ? AND route_id <> ?`,
    [route.installationId, ACTIVE_ROUTE_STATUS, route.routeId],
  );
  if (installationActive >= GITHUB_ROUTE_LIMITS.installationActive) {
    return "github_trigger_installation_active_limit_exceeded";
  }

  return null;
}

export async function getGithubSetupSession(
  env: Env,
  setupTokenHash: string,
  now: number,
): Promise<GithubSetupSessionClaim | null> {
  return env.DB.prepare(
    `SELECT user_id, server_id, return_url
     FROM github_setup_sessions
     WHERE setup_token_hash = ? AND used_at IS NULL AND expires_at > ?
     LIMIT 1`,
  )
    .bind(setupTokenHash, now)
    .first<GithubSetupSessionClaim>();
}

export async function claimGithubSetupSession(
  env: Env,
  setupTokenHash: string,
  now: number,
  session: GithubSetupSessionClaim,
): Promise<GithubSetupSessionClaim | null> {
  const claimed = await env.DB.prepare(
    `UPDATE github_setup_sessions
     SET used_at = ?
     WHERE setup_token_hash = ?
       AND used_at IS NULL
       AND expires_at > ?
       AND user_id = ?
       AND server_id = ?`,
  )
    .bind(now, setupTokenHash, now, session.user_id, session.server_id)
    .run();

  if (!claimed.meta.changes) {
    return null;
  }

  return env.DB.prepare(
    `SELECT user_id, server_id, return_url
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
    user_id: route.user_id,
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
    issue_number: event.issueNumber,
    pull_request_number: event.pullRequestNumber,
    branch: event.branch,
    workflow_name: event.workflowName,
    conclusion: event.conclusion,
    label_name: event.labelName,
    untrusted_text_excerpt: event.untrustedTextExcerpt,
    received_at: event.receivedAt,
  };
}

async function persistGithubInstallation(
  env: Env,
  userId: string,
  installation: GithubInstallationRecord,
  now: number,
): Promise<void> {
  const existing = await env.DB.prepare(
    "SELECT user_id FROM github_app_installations WHERE installation_id = ? LIMIT 1",
  )
    .bind(installation.installation_id)
    .first<{ user_id: string }>();
  if (existing && existing.user_id !== userId) {
    throw new Error("installation_already_connected");
  }

  await env.DB.prepare(
    `INSERT INTO github_app_installations(
       installation_id, user_id, account_login, account_type,
       repository_selection, suspended_at, created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(installation_id) DO UPDATE SET
       user_id = excluded.user_id,
       account_login = excluded.account_login,
       account_type = excluded.account_type,
       repository_selection = excluded.repository_selection,
       suspended_at = excluded.suspended_at,
       updated_at = excluded.updated_at`,
  )
    .bind(
      installation.installation_id,
      userId,
      installation.account_login,
      installation.account_type,
      installation.repository_selection,
      installation.suspended_at,
      now,
      now,
    )
    .run();

  if (installation.account_login) {
    await env.DB.prepare(
      `DELETE FROM github_app_installations
       WHERE user_id = ?
         AND account_login = ?
         AND account_type IS ?
         AND installation_id <> ?`,
    )
      .bind(
        userId,
        installation.account_login,
        installation.account_type,
        installation.installation_id,
      )
      .run();
  }
}

async function findUserInstallation(
  env: Env,
  userId: string,
  installationId: string,
): Promise<{ installation_id: string | number } | null> {
  return env.DB.prepare(
    `SELECT installation_id
     FROM github_app_installations
     WHERE user_id = ? AND installation_id = ?
     LIMIT 1`,
  )
    .bind(userId, installationId)
    .first<{ installation_id: string | number }>();
}

export function routeMatchesEvent(
  route: GithubEventRoute,
  event: NormalizedGithubEvent,
): boolean {
  if (!routeActionMatchesEvent(route, event)) {
    return false;
  }

  if (route.repository_id != null && event.repositoryId != null) {
    if (String(route.repository_id) !== event.repositoryId) {
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

  const commentContainsValues = normalizeCommentContainsFilters(filters);
  if (
    commentContainsValues.length > 0 &&
    !commentContainsValues.some((value) => event.untrustedTextExcerpt?.includes(value))
  ) {
    return false;
  }

  const label = normalizeTokenString(filters.label);
  if (label && normalizeTokenString(event.labelName) !== label) {
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

function validateRoutePolicy(
  eventName: string,
  action: string | null,
  filters: RouteFilters,
): string | null {
  if (eventName === "push" && !hasSpecificBranchFilter(filters)) {
    return "github_trigger_push_branch_required";
  }
  if (eventName === "issue_comment" && !hasSpecificSenderFilter(filters)) {
    return "github_trigger_comment_sender_required";
  }
  if (!branchFiltersAreValid(filters)) {
    return "github_trigger_branch_filter_invalid";
  }
  if (!senderFiltersAreValid(filters)) {
    return "github_trigger_sender_filter_invalid";
  }
  if (action && !routeActionIsAllowed(eventName, action)) {
    return "github_trigger_action_invalid";
  }
  return null;
}

export function isSupportedGithubEventAction(
  eventName: string,
  action: string | undefined,
): boolean {
  const normalized = normalizeTokenString(action);
  return !normalized || routeActionIsAllowed(eventName, normalized);
}

function routeActionIsAllowed(eventName: string, action: string): boolean {
  switch (eventName) {
    case "pull_request":
      return ["opened", "reopened", "ready_for_review", "closed", "merged"].includes(action);
    case "issues":
      return ["opened", "reopened", "labeled", "closed"].includes(action);
    case "issue_comment":
      return ["created", "edited", "deleted"].includes(action);
    case "push":
      return action === "pushed";
    case "workflow_run":
      return ["completed", "requested", "in_progress"].includes(action);
    default:
      return false;
  }
}

function hasSpecificBranchFilter(filters: RouteFilters): boolean {
  const branches = normalizeStringArray(filters.branches);
  const singleBranch = normalizeOptionalString(filters.branch);
  if (singleBranch) {
    branches.push(singleBranch);
  }
  return branches.some((branch) => !isAny(normalizeToken(branch)));
}

function hasSpecificSenderFilter(filters: RouteFilters): boolean {
  const senderLogins = normalizeTokenArray(filters.sender_logins);
  return senderLogins.length > 0 && !senderLogins.some(isAny);
}

function branchFiltersAreValid(filters: RouteFilters): boolean {
  const branches = normalizeStringArray(filters.branches);
  const singleBranch = normalizeOptionalString(filters.branch);
  if (singleBranch) {
    branches.push(singleBranch);
  }
  return branches.every(isValidBranchFilter);
}

function isValidBranchFilter(value: string): boolean {
  const branch = value.trim();
  return Boolean(branch) &&
    branch.length <= 255 &&
    branch.split("*").length <= 2 &&
    (!branch.includes("*") || branch.endsWith("*"));
}

function senderFiltersAreValid(filters: RouteFilters): boolean {
  return normalizeTokenArray(filters.sender_logins).every(isValidGithubLogin);
}

function isValidGithubLogin(value: string): boolean {
  return Boolean(value) &&
    value.length <= 100 &&
    /^[a-z0-9](?:[a-z0-9-]|\[bot\])*$/.test(value) &&
    !value.startsWith("-") &&
    !value.endsWith("-");
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
  const commentContainsAny = normalizeStringArray(filters.comment_contains_any);
  if (commentContainsAny.length > 0) {
    normalized.comment_contains_any = commentContainsAny;
  }
  const label = normalizeOptionalString(filters.label);
  if (label) {
    normalized.label = label;
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

function normalizeCommentContainsFilters(filters: RouteFilters): string[] {
  const values = normalizeStringArray(filters.comment_contains_any);
  const single = normalizeOptionalString(filters.comment_contains);
  if (single) {
    values.push(single);
  }
  return uniqueStrings(values);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }
  return unique;
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

function dedupeGithubInstallations<
  T extends {
    installation_id: string | number;
    account_login: string | null;
    account_type: string | null;
  },
>(installations: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const installation of installations) {
    const accountLogin = installation.account_login?.trim();
    const accountType = installation.account_type?.trim();
    const key = accountLogin
      ? `${accountType ?? ""}:${accountLogin.toLowerCase()}`
      : `installation:${String(installation.installation_id)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(installation);
  }
  return deduped;
}

function normalizeInt64String(value: unknown): string | null {
  if (typeof value === "string" && /^[1-9]\d{0,18}$/.test(value.trim())) {
    const trimmed = value.trim();
    return BigInt(trimmed) <= MAX_INT64 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return null;
}

function normalizeReturnUrl(
  value: string | undefined,
  fallbackOrigin: string,
  allowedOriginsConfig?: string,
): string {
  const fallbackUrl = githubSetupCompletionUrl();
  if (!value) {
    return fallbackUrl;
  }
  try {
    const url = new URL(value);
    const fallback = new URL(fallbackOrigin);
    const allowedOrigins = new Set([
      fallback.origin,
      ...DEFAULT_SETUP_RETURN_ORIGINS,
      ...parseAllowedOrigins(allowedOriginsConfig),
    ]);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      allowedOrigins.has(url.origin)
    ) {
      return url.toString();
    }
  } catch {
    /* ignore */
  }
  return fallbackUrl;
}

function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => {
      if (!origin) {
        return false;
      }
      try {
        const parsed = new URL(origin);
        return parsed.origin === origin && (parsed.protocol === "http:" || parsed.protocol === "https:");
      } catch {
        return false;
      }
    });
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
  if (
    /^github_[a-z_]+_failed(?:_\d{3}|_network|_invalid_json|_missing_token)?$/.test(message)
  ) {
    return message;
  }
  return "github_request_failed";
}

async function countGithubEventRoutes(
  env: Env,
  predicate: string,
  args: unknown[],
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM github_event_routes WHERE ${predicate}`,
  )
    .bind(...args)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
