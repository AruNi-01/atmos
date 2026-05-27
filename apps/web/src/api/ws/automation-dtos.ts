export type AutomationTriggerKind = "manual" | "scheduled" | "github";

export type AutomationTriggerStatus = "active" | "needs_setup" | "paused" | "error";

export type GithubEventFamily =
  | "pull_request"
  | "pull_request_comment"
  | "push"
  | "workflow_run";

export type GithubInt64 = string;

export interface GithubTriggerFilters {
  branch?: string | null;
  comment_contains?: string | null;
  sender_logins?: string[];
  workflow_conclusions?: string[];
}

export interface GithubTriggerConfig {
  route_id: string;
  installation_id: GithubInt64;
  repository_id?: GithubInt64 | null;
  repository_full_name: string;
  event_family: GithubEventFamily;
  actions: string[];
  filters: GithubTriggerFilters;
}

export interface AutomationTriggerInput {
  kind: AutomationTriggerKind;
  enabled?: boolean | null;
  status?: AutomationTriggerStatus | null;
  config?: GithubTriggerConfig | null;
}

const MAX_INT64 = "9223372036854775807";

export function parseGithubTriggerConfig(raw: string | null | undefined): GithubTriggerConfig | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<GithubTriggerConfig>;
    const installationId = normalizeGithubInt64String(parsed.installation_id);
    const repositoryId =
      parsed.repository_id == null ? null : normalizeGithubInt64String(parsed.repository_id);
    if (parsed.repository_id != null && !repositoryId) {
      return null;
    }
    if (
      typeof parsed.route_id === "string" &&
      parsed.route_id.trim().length > 0 &&
      installationId &&
      typeof parsed.repository_full_name === "string" &&
      parsed.repository_full_name.trim().length > 0 &&
      isGithubEventFamily(parsed.event_family)
    ) {
      return {
        route_id: parsed.route_id.trim(),
        installation_id: installationId,
        repository_id: repositoryId,
        repository_full_name: parsed.repository_full_name.trim(),
        event_family: parsed.event_family,
        actions: Array.isArray(parsed.actions)
          ? parsed.actions.filter((action): action is string => typeof action === "string")
          : [],
        filters: normalizeGithubTriggerFilters(parsed.filters),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function normalizeGithubInt64String(value: unknown): GithubInt64 | null {
  if (typeof value === "string" && /^[1-9]\d{0,18}$/.test(value.trim())) {
    const trimmed = value.trim();
    return trimmed.length < MAX_INT64.length || trimmed <= MAX_INT64 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return null;
}

function normalizeGithubTriggerFilters(value: unknown): GithubTriggerFilters {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const filters = value as GithubTriggerFilters;
  return {
    branch: typeof filters.branch === "string" ? filters.branch : null,
    comment_contains: typeof filters.comment_contains === "string" ? filters.comment_contains : null,
    sender_logins: Array.isArray(filters.sender_logins)
      ? filters.sender_logins.filter((login): login is string => typeof login === "string")
      : [],
    workflow_conclusions: Array.isArray(filters.workflow_conclusions)
      ? filters.workflow_conclusions.filter((conclusion): conclusion is string => typeof conclusion === "string")
      : [],
  };
}

function isGithubEventFamily(value: unknown): value is GithubEventFamily {
  return value === "pull_request" || value === "pull_request_comment" || value === "push" || value === "workflow_run";
}
