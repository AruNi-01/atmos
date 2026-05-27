import {
  deleteGithubRoute,
  parseGithubTriggerConfig,
  upsertGithubRoute,
  type GithubRelayPrerequisites,
} from "@/features/automations/lib/github-trigger-relay";
import type { TriggerChoice } from "@/features/automations/lib/automation-schedule";
import type {
  AutomationCreateRequest,
  AutomationDetail,
  AutomationSummary,
  AutomationTriggerInput,
  AutomationUpdateRequest,
  GithubTriggerConfig,
} from "@/features/automations/types";

export async function createAutomationWithGithubRoute({
  request,
  githubConfig,
  githubRouteReady,
  githubPrereqs,
  createAutomation,
  updateAutomation,
}: {
  request: AutomationCreateRequest;
  githubConfig: GithubTriggerConfig | null;
  githubRouteReady: boolean;
  githubPrereqs: GithubRelayPrerequisites;
  createAutomation: (request: AutomationCreateRequest) => Promise<AutomationDetail>;
  updateAutomation: (request: AutomationUpdateRequest) => Promise<AutomationDetail>;
}): Promise<AutomationDetail> {
  const detail = await createAutomation(request);
  if (!githubConfig || !githubRouteReady) {
    return detail;
  }

  let routeUpserted = false;
  try {
    await upsertGithubRoute(githubPrereqs, detail.guid, githubConfig, true);
    routeUpserted = true;
    return await updateAutomation({
      automation_guid: detail.guid,
      trigger: triggerInputForSubmit("github", githubConfig, true),
    });
  } catch (err) {
    const rollbackErrors: string[] = [];
    if (routeUpserted) {
      await deleteGithubRoute(githubPrereqs, githubConfig.route_id).catch((rollbackErr) => {
        rollbackErrors.push(formatError(rollbackErr));
      });
    }
    throw flowError(err, rollbackErrors);
  }
}

export async function updateAutomationWithGithubRoute({
  request,
  initialAutomation,
  trigger,
  previousGithubConfig,
  nextGithubConfig,
  githubRouteReady,
  githubPrereqs,
  updateAutomation,
}: {
  request: Omit<AutomationUpdateRequest, "trigger">;
  initialAutomation: AutomationDetail;
  trigger: TriggerChoice;
  previousGithubConfig: GithubTriggerConfig | null;
  nextGithubConfig: GithubTriggerConfig | null;
  githubRouteReady: boolean;
  githubPrereqs: GithubRelayPrerequisites;
  updateAutomation: (request: AutomationUpdateRequest) => Promise<AutomationDetail>;
}): Promise<AutomationDetail> {
  const previousRouteId = previousGithubConfig?.route_id ?? null;
  const nextRouteId = nextGithubConfig?.route_id ?? null;
  const existingGithubRouteStillActive =
    trigger === "github" &&
    Boolean(nextGithubConfig) &&
    Boolean(previousGithubConfig) &&
    initialAutomation.trigger_enabled === true &&
    initialAutomation.trigger_status === "active" &&
    githubConfigEquals(previousGithubConfig, nextGithubConfig);
  const shouldSyncNextRoute = Boolean(
    nextGithubConfig && githubRouteReady && !existingGithubRouteStillActive,
  );
  const shouldDeletePreviousRoute = Boolean(
    previousRouteId && (trigger !== "github" || previousRouteId !== nextRouteId),
  );
  let nextRouteUpserted = false;
  let previousRouteDeleted = false;

  try {
    if (shouldSyncNextRoute && nextGithubConfig) {
      await upsertGithubRoute(githubPrereqs, initialAutomation.guid, nextGithubConfig, true);
      nextRouteUpserted = true;
    }
    if (shouldDeletePreviousRoute && previousRouteId) {
      try {
        await deleteGithubRoute(githubPrereqs, previousRouteId);
        previousRouteDeleted = true;
      } catch (err) {
        throw new Error(`Could not remove the previous GitHub route: ${formatError(err)}`);
      }
    }

    const activeGithubRoute = Boolean(
      nextGithubConfig && (githubRouteReady || existingGithubRouteStillActive),
    );
    return await updateAutomation({
      ...request,
      trigger: triggerInputForSubmit(trigger, nextGithubConfig, activeGithubRoute),
    });
  } catch (err) {
    const rollbackErrors: string[] = [];
    if (
      previousRouteDeleted &&
      previousGithubConfig &&
      initialAutomation.trigger_enabled &&
      initialAutomation.trigger_status === "active"
    ) {
      await upsertGithubRoute(githubPrereqs, initialAutomation.guid, previousGithubConfig, true).catch(
        (rollbackErr) => {
          rollbackErrors.push(`previous route restore: ${formatError(rollbackErr)}`);
        },
      );
    }
    if (nextRouteUpserted && nextRouteId && nextRouteId !== previousRouteId) {
      await deleteGithubRoute(githubPrereqs, nextRouteId).catch((rollbackErr) => {
        rollbackErrors.push(`new route cleanup: ${formatError(rollbackErr)}`);
      });
    }
    throw flowError(err, rollbackErrors);
  }
}

export async function deleteAutomationWithGithubRoute({
  automation,
  githubPrereqs,
  deleteAutomation,
}: {
  automation: AutomationSummary;
  githubPrereqs: GithubRelayPrerequisites;
  deleteAutomation: (automationGuid: string) => Promise<unknown>;
}): Promise<void> {
  const githubConfig = parseGithubTriggerConfig(automation.trigger_config_json);
  if (githubConfig?.route_id) {
    try {
      await deleteGithubRoute(githubPrereqs, githubConfig.route_id);
    } catch (err) {
      throw new Error(`Delete blocked because the GitHub route could not be removed: ${formatError(err)}`);
    }
  }
  await deleteAutomation(automation.guid);
}

export function triggerInputForSubmit(
  trigger: TriggerChoice,
  githubConfig: GithubTriggerConfig | null,
  activeGithubRoute: boolean,
): AutomationTriggerInput | null {
  if (trigger !== "github") {
    return null;
  }
  return {
    kind: "github",
    enabled: activeGithubRoute && Boolean(githubConfig),
    status: activeGithubRoute ? "active" : "needs_setup",
    config: githubConfig,
  };
}

function githubConfigEquals(left: GithubTriggerConfig | null, right: GithubTriggerConfig | null) {
  if (!left || !right) {
    return left === right;
  }
  return (
    left.route_id.trim() === right.route_id.trim() &&
    left.installation_id === right.installation_id &&
    normalizeNullableNumber(left.repository_id) === normalizeNullableNumber(right.repository_id) &&
    left.repository_full_name.trim().toLowerCase() === right.repository_full_name.trim().toLowerCase() &&
    left.event_family === right.event_family &&
    stringArrayEquals(normalizeStringArray(left.actions), normalizeStringArray(right.actions)) &&
    normalizeNullableString(left.filters.branch) === normalizeNullableString(right.filters.branch) &&
    normalizeNullableString(left.filters.comment_contains) === normalizeNullableString(right.filters.comment_contains) &&
    stringArrayEquals(
      normalizeStringArray(left.filters.sender_logins, true),
      normalizeStringArray(right.filters.sender_logins, true),
    ) &&
    stringArrayEquals(
      normalizeStringArray(left.filters.workflow_conclusions),
      normalizeStringArray(right.filters.workflow_conclusions),
    )
  );
}

function normalizeNullableNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeNullableString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeStringArray(values: string[] | null | undefined, caseInsensitive = false) {
  return (values ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (caseInsensitive ? value.toLowerCase() : value))
    .sort();
}

function stringArrayEquals(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function flowError(err: unknown, rollbackErrors: string[]): Error {
  const message = formatError(err);
  if (rollbackErrors.length === 0) {
    return err instanceof Error ? err : new Error(message);
  }
  return new Error(`${message} Rollback cleanup also failed: ${rollbackErrors.join("; ")}`);
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
