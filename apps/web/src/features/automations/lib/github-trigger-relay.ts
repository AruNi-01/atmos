import { wsRequest } from "@/api/ws/request";
import type { GithubEventFamily, GithubInt64, GithubTriggerConfig } from "@/features/automations/types";

const MAX_INT64 = "9223372036854775807";

export interface GithubInstallation {
  installation_id: GithubInt64;
  account_login: string | null;
  account_type: string | null;
  repository_selection: string;
  suspended_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface GithubRepository {
  id: GithubInt64;
  full_name: string;
  private: boolean;
  default_branch: string;
}

export interface GithubRelayPrerequisites {
  controlPlaneUrl: string;
  accessToken: string;
  serverId: string | null;
}

export interface GithubRouteUpsertResult {
  route_id: string;
  route_status: string;
  enabled: boolean;
}

export function hasGithubRelayPrerequisites(prereqs: GithubRelayPrerequisites): boolean {
  return (
    prereqs.controlPlaneUrl.trim().length > 0 &&
    prereqs.accessToken.length >= 32 &&
    Boolean(prereqs.serverId?.trim())
  );
}

export function generateGithubRouteId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `route_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

export function parseGithubTriggerConfig(raw: string | null | undefined): GithubTriggerConfig | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as GithubTriggerConfig;
    if (
      typeof parsed.route_id === "string" &&
      normalizeInt64String(parsed.installation_id) &&
      typeof parsed.repository_full_name === "string" &&
      isGithubEventFamily(parsed.event_family)
    ) {
      return {
        ...parsed,
        installation_id: normalizeInt64String(parsed.installation_id)!,
        repository_id: normalizeInt64String(parsed.repository_id),
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        filters: parsed.filters ?? {},
      };
    }
  } catch {
    return null;
  }
  return null;
}

export async function createGithubSetupSession(
  prereqs: GithubRelayPrerequisites,
  returnUrl: string,
): Promise<{
  install_url: string;
  expires_at: number;
  server_id: string;
}> {
  if (!hasGithubRelayPrerequisites(prereqs) || !prereqs.serverId) {
    throw new Error("Connect this Computer to Atmos Relay before setting up GitHub.");
  }
  return githubRelayRequest(prereqs, "automation_github_setup_session", {
      server_id: prereqs.serverId,
      return_url: returnUrl,
  });
}

export async function listGithubInstallations(
  prereqs: GithubRelayPrerequisites,
): Promise<GithubInstallation[]> {
  const data = await githubRelayRequest<{ installations?: GithubInstallation[] }>(
    prereqs,
    "automation_github_installations",
  );
  return data.installations ?? [];
}

export async function listGithubRepositories(
  prereqs: GithubRelayPrerequisites,
  installationId: GithubInt64,
): Promise<GithubRepository[]> {
  const data = await githubRelayRequest<{ repositories?: GithubRepository[] }>(
    prereqs,
    "automation_github_repositories",
    { installation_id: installationId },
  );
  return data.repositories ?? [];
}

export async function upsertGithubRoute(
  prereqs: GithubRelayPrerequisites,
  automationGuid: string,
  config: GithubTriggerConfig,
  enabled: boolean,
): Promise<GithubRouteUpsertResult> {
  if (!hasGithubRelayPrerequisites(prereqs) || !prereqs.serverId) {
    throw new Error("Connect this Computer to Atmos Relay before syncing the GitHub route.");
  }
  return githubRelayRequest(prereqs, "automation_github_event_route_upsert", {
      route_id: config.route_id,
      server_id: prereqs.serverId,
      automation_guid: automationGuid,
      installation_id: config.installation_id,
      repository_id: config.repository_id ?? null,
      repository_full_name: config.repository_full_name,
      event_name: githubEventName(config.event_family),
      action: config.actions[0] ?? null,
      filters: relayFilters(config),
      enabled,
  });
}

export async function deleteGithubRoute(
  prereqs: GithubRelayPrerequisites,
  routeId: string,
): Promise<void> {
  const normalizedRouteId = routeId.trim();
  if (!normalizedRouteId) {
    return;
  }
  if (!hasGithubRelayPrerequisites(prereqs)) {
    throw new Error("Connect this Computer to Atmos Relay before removing the GitHub route.");
  }
  try {
    await githubRelayRequest(prereqs, "automation_github_event_route_delete", {
      route_id: normalizedRouteId,
    });
  } catch (err) {
    if (isGithubRouteMissingError(err)) {
      return;
    }
    throw err;
  }
}

async function githubRelayRequest<T>(
  prereqs: GithubRelayPrerequisites,
  action:
    | "automation_github_setup_session"
    | "automation_github_installations"
    | "automation_github_repositories"
    | "automation_github_event_route_upsert"
    | "automation_github_event_route_delete",
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (!prereqs.accessToken) {
    throw new Error("Atmos Relay Access Token is missing.");
  }
  return wsRequest<T>(action, {
    control_plane_url: prereqs.controlPlaneUrl,
    access_token: prereqs.accessToken.trim(),
    ...payload,
  });
}

function isGithubRouteMissingError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("HTTP 404") || message.toLowerCase().includes("not_found");
}

function githubEventName(family: GithubEventFamily): string {
  switch (family) {
    case "pull_request":
      return "pull_request";
    case "pull_request_comment":
      return "issue_comment";
    case "push":
      return "push";
    case "workflow_run":
      return "workflow_run";
  }
}

function relayFilters(config: GithubTriggerConfig): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  if (config.filters.branch?.trim()) {
    filters.branch = config.filters.branch.trim();
  }
  if (config.filters.comment_contains?.trim()) {
    filters.comment_contains = config.filters.comment_contains.trim();
  }
  if (config.filters.sender_logins?.length) {
    filters.sender_logins = config.filters.sender_logins;
  }
  if (config.filters.workflow_conclusions?.length) {
    filters.conclusions = config.filters.workflow_conclusions;
  }
  return filters;
}

function isGithubEventFamily(value: string): value is GithubEventFamily {
  return value === "pull_request" || value === "pull_request_comment" || value === "push" || value === "workflow_run";
}

function normalizeInt64String(value: unknown): GithubInt64 | null {
  if (typeof value === "string" && /^[1-9]\d{0,18}$/.test(value.trim())) {
    const trimmed = value.trim();
    return trimmed.length < MAX_INT64.length || trimmed <= MAX_INT64 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return null;
}
