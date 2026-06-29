import { createTranslator } from "next-intl";

import { wsRequest } from "@/api/ws/request";
import { parseGithubTriggerConfig } from "@/api/ws/automation-dtos";
import type { GithubEventFamily, GithubInt64, GithubTriggerConfig } from "@/features/automations/types";
import { currentAppLocale } from "@/shared/lib/current-app-locale";
import enMessages from "../../../../messages/en.json";
import zhMessages from "../../../../messages/zh.json";

type AutomationsLocale = "en" | "zh";

let cachedLocale: AutomationsLocale | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedTranslator: any = null;

function automationsT(
  key: string,
  values?: Record<string, string | number>,
): string {
  const locale: AutomationsLocale =
    currentAppLocale("en") === "zh" ? "zh" : "en";
  if (!cachedTranslator || cachedLocale !== locale) {
    cachedLocale = locale;
    cachedTranslator = createTranslator({
      locale,
      messages: locale === "zh" ? zhMessages : enMessages,
      namespace: "automation" as never,
    });
  }

  return cachedTranslator(key as never, values as never);
}

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
  relayUrl: string;
  accessToken: string;
  relaySecretKey: string;
  serverId: string | null;
  serverCredentialsAvailable: boolean;
}

export interface GithubRouteUpsertResult {
  route_id: string;
  route_status: string;
  enabled: boolean;
}

export function hasGithubRelayPrerequisites(prereqs: GithubRelayPrerequisites): boolean {
  const hasBrowserAccessToken = prereqs.accessToken.trim().length >= 32;
  return (
    prereqs.relayUrl.trim().length > 0 &&
    Boolean(prereqs.serverId?.trim()) &&
    (hasBrowserAccessToken || prereqs.serverCredentialsAvailable)
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

export async function createGithubSetupSession(
  prereqs: GithubRelayPrerequisites,
  returnUrl: string,
): Promise<{
  install_url: string;
  expires_at: number;
  server_id: string;
}> {
  if (!hasGithubRelayPrerequisites(prereqs) || !prereqs.serverId) {
    throw new Error(
      automationsT("githubRelay.errors.connectComputerBeforeSetup"),
    );
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
    throw new Error(
      automationsT("githubRelay.errors.connectComputerBeforeSync"),
    );
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
    throw new Error(
      automationsT("githubRelay.errors.connectComputerBeforeRemove"),
    );
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
  const accessToken = prereqs.accessToken.trim();
  if (!accessToken && !prereqs.serverCredentialsAvailable) {
    throw new Error(automationsT("githubRelay.errors.accessTokenMissing"));
  }
  const relayPayload: Record<string, unknown> = {
    relay_url: prereqs.relayUrl,
    relay_secret_key: prereqs.relaySecretKey.trim() || null,
    ...payload,
  };
  if (accessToken) {
    relayPayload.access_token = accessToken;
  }
  return wsRequest<T>(action, relayPayload);
}

function isGithubRouteMissingError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("HTTP 404") || message.toLowerCase().includes("not_found");
}

function githubEventName(family: GithubEventFamily): string {
  switch (family) {
    case "pull_request":
      return "pull_request";
    case "issues":
      return "issues";
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
  if (config.filters.comment_contains_any?.length) {
    filters.comment_contains_any = config.filters.comment_contains_any
      .map((value) => value.trim())
      .filter(Boolean);
  }
  if (config.filters.label?.trim()) {
    filters.label = config.filters.label.trim();
  }
  if (config.filters.sender_logins?.length) {
    filters.sender_logins = config.filters.sender_logins;
  }
  if (config.filters.workflow_conclusions?.length) {
    filters.conclusions = config.filters.workflow_conclusions;
  }
  if (config.filters.workflow_name?.trim()) {
    filters.workflow_name = config.filters.workflow_name.trim();
  }
  return filters;
}

export { parseGithubTriggerConfig };
