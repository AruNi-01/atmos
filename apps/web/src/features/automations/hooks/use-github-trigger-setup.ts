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
  GithubInt64,
  GithubTriggerConfig,
} from "@/features/automations/types";
import type { TriggerChoice } from "@/features/automations/lib/automation-schedule";
import { ensureComputerClientSettingsHydrated } from "@/features/connection/lib/sync-computer-client-settings";
import { openDesktopExternalUrl } from "@/shared/lib/desktop-external-url";
import { isTauriRuntime } from "@/shared/lib/desktop-runtime";

const HOSTED_GITHUB_SETUP_COMPLETION_ORIGIN = "https://app.atmos.land";

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
  const [githubInstallationId, setGithubInstallationId] = React.useState<GithubInt64 | null>(null);
  const [githubRepositoryFullName, setGithubRepositoryFullName] = React.useState("");
  const [githubEventFamily, setGithubEventFamily] = React.useState<GithubEventFamily>("pull_request");
  const [githubIssueAction, setGithubIssueAction] = React.useState("labeled");
  const [githubIssueLabel, setGithubIssueLabel] = React.useState("");
  const [githubPullRequestAction, setGithubPullRequestAction] = React.useState("opened");
  const [githubBranchFilter, setGithubBranchFilter] = React.useState("main");
  const [githubCommentContains, setGithubCommentContains] = React.useState("");
  const [githubSenderLogins, setGithubSenderLogins] = React.useState("");
  const [githubWorkflowName, setGithubWorkflowName] = React.useState("");
  const [githubWorkflowConclusion, setGithubWorkflowConclusion] = React.useState("failure");
  const [githubLoading, setGithubLoading] = React.useState(false);
  const [githubRepositoriesLoading, setGithubRepositoriesLoading] = React.useState(false);
  const [githubError, setGithubError] = React.useState<string | null>(null);
  const [githubSetupRefreshAvailable, setGithubSetupRefreshAvailable] = React.useState(false);
  const githubInstallationIdRef = React.useRef<GithubInt64 | null>(githubInstallationId);
  const githubRepositoryFullNameRef = React.useRef(githubRepositoryFullName);

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
    : "GitHub webhooks require a connected Atmos Computer with Relay configured.";
  const githubWorkflowRunReady =
    githubEventFamily !== "workflow_run" || githubWorkflowName.trim().length > 0;
  const githubRouteReady =
    trigger !== "github" ||
    (githubRelayReady &&
      !!githubInstallationId &&
      githubRepositoryFullName.trim().length > 0 &&
      githubInstallations.length > 0 &&
      githubWorkflowRunReady);

  React.useEffect(() => {
    void ensureComputerClientSettingsHydrated();
  }, []);

  React.useEffect(() => {
    githubInstallationIdRef.current = githubInstallationId;
  }, [githubInstallationId]);

  React.useEffect(() => {
    githubRepositoryFullNameRef.current = githubRepositoryFullName;
  }, [githubRepositoryFullName]);

  React.useEffect(() => {
    if (mode !== "edit" || !initialGithubConfig) {
      setGithubRouteId(generateGithubRouteId());
      setGithubInstallationId(null);
      setGithubRepositoryFullName("");
      setGithubEventFamily("pull_request");
      setGithubIssueAction("labeled");
      setGithubIssueLabel("");
      setGithubPullRequestAction("opened");
      setGithubBranchFilter("main");
      setGithubCommentContains("");
      setGithubSenderLogins("");
      setGithubWorkflowName("");
      setGithubWorkflowConclusion("failure");
      return;
    }
    setGithubRouteId(initialGithubConfig.route_id);
    setGithubInstallationId(initialGithubConfig.installation_id);
    setGithubRepositoryFullName(initialGithubConfig.repository_full_name);
    setGithubEventFamily(initialGithubConfig.event_family);
    setGithubIssueAction(initialGithubConfig.actions[0] ?? "labeled");
    setGithubIssueLabel(initialGithubConfig.filters.label ?? "");
    setGithubPullRequestAction(initialGithubConfig.actions[0] ?? "opened");
    setGithubBranchFilter(initialGithubConfig.filters.branch ?? "main");
    setGithubCommentContains(initialGithubConfig.filters.comment_contains ?? "");
    setGithubSenderLogins((initialGithubConfig.filters.sender_logins ?? []).join(","));
    setGithubWorkflowName(initialGithubConfig.filters.workflow_name ?? "");
    setGithubWorkflowConclusion(initialGithubConfig.filters.workflow_conclusions?.[0] ?? "failure");
  }, [initialGithubConfig, mode]);

  const applyGithubInstallations = React.useCallback((installations: GithubInstallation[]) => {
    setGithubInstallations(installations);
    const selectedInstallationId = githubInstallationIdRef.current;
    const selectedInstallationStillAvailable =
      !!selectedInstallationId &&
      installations.some((installation) => installation.installation_id === selectedInstallationId);
    if (!selectedInstallationStillAvailable && installations[0]) {
      setGithubInstallationId(installations[0].installation_id);
    } else if (!selectedInstallationStillAvailable) {
      setGithubInstallationId(null);
    }
  }, []);

  const refreshGithubInstallations = React.useCallback(async () => {
    if (!githubRelayReady) {
      setGithubInstallations([]);
      setGithubLoading(false);
      return;
    }
    setGithubLoading(true);
    setGithubError(null);
    try {
      const installations = await listGithubInstallations(githubPrereqs);
      applyGithubInstallations(installations);
    } catch (err) {
      setGithubInstallations([]);
      setGithubError(err instanceof Error ? err.message : "Failed to load GitHub installations");
    } finally {
      setGithubLoading(false);
    }
  }, [applyGithubInstallations, githubPrereqs, githubRelayReady]);

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
        if (!cancelled) applyGithubInstallations(installations);
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
  }, [applyGithubInstallations, githubPrereqs, githubRelayReady, trigger]);

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
        const selectedRepositoryFullName = githubRepositoryFullNameRef.current;
        if (!repositories.some((repo) => repo.full_name === selectedRepositoryFullName)) {
          const preserveExistingRepository =
            mode === "edit" &&
            selectedRepositoryFullName.trim().length > 0 &&
            initialGithubConfig?.repository_full_name === selectedRepositoryFullName;
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
    initialGithubConfig,
    mode,
    trigger,
  ]);

  const buildGithubConfig = React.useCallback((): GithubTriggerConfig | null => {
    if (!githubInstallationId || !githubRepositoryFullName.trim()) {
      return null;
    }
    if (githubEventFamily === "workflow_run" && !githubWorkflowName.trim()) {
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
    }
    if (githubEventFamily === "issues" && githubIssueAction === "labeled") {
      if (githubIssueLabel.trim()) {
        filters.label = githubIssueLabel.trim();
      }
    }
    if (githubEventFamily === "pull_request_comment" || githubEventFamily === "issues") {
      const senderLogins = githubSenderLogins
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (senderLogins.length > 0) {
        filters.sender_logins = senderLogins;
      }
    }
    if (githubEventFamily === "workflow_run") {
      if (githubWorkflowName.trim()) {
        filters.workflow_name = githubWorkflowName.trim();
      }
      if (githubWorkflowConclusion !== "any") {
        filters.workflow_conclusions = [githubWorkflowConclusion];
      }
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
          : githubEventFamily === "issues"
            ? [githubIssueAction]
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
    githubIssueAction,
    githubIssueLabel,
    githubInstallationId,
    githubPullRequestAction,
    githubRepositoryFullName,
    githubRouteId,
    githubSelectedRepository?.id,
    githubSenderLogins,
    githubWorkflowConclusion,
    githubWorkflowName,
    initialGithubConfig,
  ]);

  const startGithubSetup = React.useCallback(
    async () => {
      setGithubError(null);
      setGithubLoading(true);
      const reservedBrowserWindow =
        typeof window !== "undefined" && !isTauriRuntime()
          ? window.open("", "_blank")
          : null;
      if (reservedBrowserWindow) {
        reservedBrowserWindow.opener = null;
      }

      try {
        const returnUrl = githubSetupCompletionReturnUrl();
        const session = await createGithubSetupSession(githubPrereqs, returnUrl);
        const openedByDesktop = await openDesktopExternalUrl(session.install_url);
        if (openedByDesktop) {
          reservedBrowserWindow?.close();
          setGithubSetupRefreshAvailable(true);
          return;
        }
        if (reservedBrowserWindow && !reservedBrowserWindow.closed) {
          reservedBrowserWindow.location.href = session.install_url;
          setGithubSetupRefreshAvailable(true);
          return;
        }
        if (typeof window === "undefined") {
          return;
        }
        const openedWindow = window.open(session.install_url, "_blank");
        if (!openedWindow) {
          throw new Error("Browser blocked the GitHub setup window. Allow pop-ups for Atmos and try again.");
        }
        openedWindow.opener = null;
        setGithubSetupRefreshAvailable(true);
      } catch (err) {
        reservedBrowserWindow?.close();
        setGithubError(err instanceof Error ? err.message : "Failed to start GitHub setup");
      } finally {
        setGithubLoading(false);
      }
    },
    [githubPrereqs],
  );

  const resetGithubSetupButton = React.useCallback(() => {
    setGithubSetupRefreshAvailable(false);
  }, []);

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
    githubSetupRefreshAvailable,
    githubInstallationId,
    githubRepositoryFullName,
    githubEventFamily,
    githubIssueAction,
    githubIssueLabel,
    githubPullRequestAction,
    githubBranchFilter,
    githubCommentContains,
    githubSenderLogins,
    githubWorkflowName,
    githubWorkflowConclusion,
    githubSetupMessage,
    buildGithubConfig,
    refreshGithubInstallations,
    resetGithubSetupButton,
    startGithubSetup,
    setGithubInstallationId,
    setGithubRepositoryFullName,
    setGithubEventFamily,
    setGithubIssueAction,
    setGithubIssueLabel,
    setGithubPullRequestAction,
    setGithubBranchFilter,
    setGithubCommentContains,
    setGithubSenderLogins,
    setGithubWorkflowName,
    setGithubWorkflowConclusion,
  };
}

function githubSetupCompletionReturnUrl(): string {
  const locale = currentLocaleFromLocation();
  const path = `/${locale}/github/setup/complete`;
  if (typeof window !== "undefined" && !isTauriRuntime()) {
    const { origin, protocol } = window.location;
    if (protocol === "http:" || protocol === "https:") {
      return `${origin}${path}`;
    }
  }
  return `${HOSTED_GITHUB_SETUP_COMPLETION_ORIGIN}${path}`;
}

function currentLocaleFromLocation(): "en" | "zh" {
  if (typeof window === "undefined") {
    return "en";
  }
  const firstSegment = window.location.pathname.split("/").filter(Boolean)[0];
  return firstSegment === "zh" ? "zh" : "en";
}
