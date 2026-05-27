"use client";

import * as React from "react";

import { useGithubRelayPrerequisites } from "@/features/automations/hooks/use-github-relay-prerequisites";
import {
  createGithubSetupSession,
  generateGithubRouteId,
  hasGithubRelayPrerequisites,
  listGithubInstallations,
  listGithubRepositories,
  parseGithubTriggerConfig,
  type GithubInstallation,
  type GithubRepository,
} from "@/features/automations/lib/github-trigger-relay";
import type {
  AutomationDetail,
  GithubEventFamily,
  GithubTriggerConfig,
} from "@/features/automations/types";
import type { TriggerChoice } from "@/features/automations/lib/automation-schedule";
import { ensureComputerClientSettingsHydrated } from "@/features/connection/lib/sync-computer-client-settings";

export function useGithubTriggerSetup({
  mode,
  initialAutomation,
  trigger,
}: {
  mode: "create" | "edit";
  initialAutomation: AutomationDetail | null;
  trigger: TriggerChoice;
}) {
  const githubPrereqs = useGithubRelayPrerequisites();
  const [githubRouteId, setGithubRouteId] = React.useState(generateGithubRouteId);
  const [githubInstallations, setGithubInstallations] = React.useState<GithubInstallation[]>([]);
  const [githubRepositories, setGithubRepositories] = React.useState<GithubRepository[]>([]);
  const [githubInstallationId, setGithubInstallationId] = React.useState<number | null>(null);
  const [githubRepositoryFullName, setGithubRepositoryFullName] = React.useState("");
  const [githubEventFamily, setGithubEventFamily] = React.useState<GithubEventFamily>("pull_request");
  const [githubPullRequestAction, setGithubPullRequestAction] = React.useState("opened");
  const [githubBranchFilter, setGithubBranchFilter] = React.useState("main");
  const [githubCommentContains, setGithubCommentContains] = React.useState("");
  const [githubSenderLogins, setGithubSenderLogins] = React.useState("");
  const [githubWorkflowConclusion, setGithubWorkflowConclusion] = React.useState("failure");
  const [githubLoading, setGithubLoading] = React.useState(false);
  const [githubRepositoriesLoading, setGithubRepositoriesLoading] = React.useState(false);
  const [githubError, setGithubError] = React.useState<string | null>(null);

  const githubRelayReady = hasGithubRelayPrerequisites(githubPrereqs);
  const initialGithubConfig = React.useMemo(
    () =>
      mode === "edit" && initialAutomation
        ? parseGithubTriggerConfig(initialAutomation.trigger_config_json)
        : null,
    [initialAutomation, mode],
  );
  const githubSelectedRepository = React.useMemo(
    () => githubRepositories.find((repo) => repo.full_name === githubRepositoryFullName) ?? null,
    [githubRepositories, githubRepositoryFullName],
  );
  const githubSetupMessage = githubRelayReady
    ? githubInstallations.length > 0
      ? "Choose an installation and repository. Relay stores route metadata only."
      : "Install or update the Atmos GitHub App for this Relay tenant."
    : "GitHub webhooks require an Atmos Relay Access Token and a registered Computer.";
  const githubRouteReady =
    trigger !== "github" ||
    (githubRelayReady &&
      !!githubInstallationId &&
      githubRepositoryFullName.trim().length > 0 &&
      githubInstallations.length > 0);

  React.useEffect(() => {
    void ensureComputerClientSettingsHydrated();
  }, []);

  React.useEffect(() => {
    if (mode !== "edit" || !initialGithubConfig) {
      return;
    }
    setGithubRouteId(initialGithubConfig.route_id);
    setGithubInstallationId(initialGithubConfig.installation_id);
    setGithubRepositoryFullName(initialGithubConfig.repository_full_name);
    setGithubEventFamily(initialGithubConfig.event_family);
    setGithubPullRequestAction(initialGithubConfig.actions[0] ?? "opened");
    setGithubBranchFilter(initialGithubConfig.filters.branch ?? "main");
    setGithubCommentContains(initialGithubConfig.filters.comment_contains ?? "");
    setGithubSenderLogins((initialGithubConfig.filters.sender_logins ?? []).join(","));
    setGithubWorkflowConclusion(initialGithubConfig.filters.workflow_conclusions?.[0] ?? "failure");
  }, [initialGithubConfig, mode]);

  React.useEffect(() => {
    if (trigger !== "github" || !githubRelayReady) {
      setGithubInstallations([]);
      setGithubLoading(false);
      return;
    }
    let cancelled = false;
    setGithubLoading(true);
    setGithubError(null);
    listGithubInstallations(githubPrereqs)
      .then((installations) => {
        if (cancelled) return;
        setGithubInstallations(installations);
        if (!githubInstallationId && installations[0]) {
          setGithubInstallationId(installations[0].installation_id);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setGithubInstallations([]);
        setGithubError(err instanceof Error ? err.message : "Failed to load GitHub installations");
      })
      .finally(() => {
        if (!cancelled) setGithubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [githubInstallationId, githubPrereqs, githubRelayReady, trigger]);

  React.useEffect(() => {
    if (trigger !== "github" || !githubRelayReady || !githubInstallationId) {
      setGithubRepositories([]);
      setGithubRepositoriesLoading(false);
      return;
    }
    let cancelled = false;
    setGithubRepositoriesLoading(true);
    setGithubError(null);
    listGithubRepositories(githubPrereqs, githubInstallationId)
      .then((repositories) => {
        if (cancelled) return;
        setGithubRepositories(repositories);
        if (!repositories.some((repo) => repo.full_name === githubRepositoryFullName)) {
          const preserveExistingRepository =
            mode === "edit" &&
            githubRepositoryFullName.trim().length > 0 &&
            initialGithubConfig?.repository_full_name === githubRepositoryFullName;
          if (!preserveExistingRepository) {
            setGithubRepositoryFullName(repositories[0]?.full_name ?? "");
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setGithubRepositories([]);
        setGithubError(err instanceof Error ? err.message : "Failed to load GitHub repositories");
      })
      .finally(() => {
        if (!cancelled) setGithubRepositoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    githubInstallationId,
    githubPrereqs,
    githubRelayReady,
    githubRepositoryFullName,
    initialGithubConfig,
    mode,
    trigger,
  ]);

  const buildGithubConfig = React.useCallback((): GithubTriggerConfig | null => {
    if (!githubInstallationId || !githubRepositoryFullName.trim()) {
      return null;
    }
    const repositoryFullName = githubRepositoryFullName.trim();
    const preservedRepositoryId =
      initialGithubConfig?.installation_id === githubInstallationId &&
      initialGithubConfig.repository_full_name.trim().toLowerCase() === repositoryFullName.toLowerCase()
        ? initialGithubConfig.repository_id ?? null
        : null;
    const filters: GithubTriggerConfig["filters"] = {};
    if (githubEventFamily === "push" && githubBranchFilter.trim()) {
      filters.branch = githubBranchFilter.trim();
    }
    if (githubEventFamily === "pull_request_comment") {
      if (githubCommentContains.trim()) {
        filters.comment_contains = githubCommentContains.trim();
      }
      const senderLogins = githubSenderLogins
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (senderLogins.length > 0) {
        filters.sender_logins = senderLogins;
      }
    }
    if (githubEventFamily === "workflow_run" && githubWorkflowConclusion !== "any") {
      filters.workflow_conclusions = [githubWorkflowConclusion];
    }
    return {
      route_id: githubRouteId,
      installation_id: githubInstallationId,
      repository_id: githubSelectedRepository?.id ?? preservedRepositoryId,
      repository_full_name: repositoryFullName,
      event_family: githubEventFamily,
      actions:
        githubEventFamily === "pull_request"
          ? [githubPullRequestAction]
          : githubEventFamily === "pull_request_comment"
            ? ["created"]
            : githubEventFamily === "workflow_run"
              ? ["completed"]
              : [],
      filters,
    };
  }, [
    githubBranchFilter,
    githubCommentContains,
    githubEventFamily,
    githubInstallationId,
    githubPullRequestAction,
    githubRepositoryFullName,
    githubRouteId,
    githubSelectedRepository?.id,
    githubSenderLogins,
    githubWorkflowConclusion,
    initialGithubConfig,
  ]);

  const startGithubSetup = React.useCallback(
    async (returnUrl: string) => {
      setGithubError(null);
      setGithubLoading(true);
      try {
        const session = await createGithubSetupSession(githubPrereqs, returnUrl);
        window.location.assign(session.install_url);
      } catch (err) {
        setGithubError(err instanceof Error ? err.message : "Failed to start GitHub setup");
      } finally {
        setGithubLoading(false);
      }
    },
    [githubPrereqs],
  );

  return {
    githubPrereqs,
    githubRelayReady,
    githubRouteReady,
    initialGithubConfig,
    githubInstallations,
    githubRepositories,
    githubLoading,
    githubRepositoriesLoading,
    githubError,
    githubInstallationId,
    githubRepositoryFullName,
    githubEventFamily,
    githubPullRequestAction,
    githubBranchFilter,
    githubCommentContains,
    githubSenderLogins,
    githubWorkflowConclusion,
    githubSetupMessage,
    buildGithubConfig,
    startGithubSetup,
    setGithubInstallationId,
    setGithubRepositoryFullName,
    setGithubEventFamily,
    setGithubPullRequestAction,
    setGithubBranchFilter,
    setGithubCommentContains,
    setGithubSenderLogins,
    setGithubWorkflowConclusion,
  };
}
