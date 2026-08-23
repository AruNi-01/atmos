"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ActionRun } from "@/features/github/components/ActionsPanel";
import { useGithubCenterTabsStore } from "@/features/github/store/use-github-center-tabs";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { useTaskGithubDrawerNav } from "@/features/task/components/task-github-drawer/task-github-drawer-nav-context";
import { hostIdFromCenterKey } from "@/app-shell/center-space/center-space";
import { resolveCenterOpenContextId } from "@/app-shell/center-space/center-open-context";
import { useCenterPaintContextId } from "@/app-shell/center-space/use-center-paint-context-id";
import { activateCenterChromeTab } from "@/app-shell/center-stage-activate";

export function useOpenGithubCenterTab() {
  const t = useTranslations("github.centerTabs");
  const router = useAppRouter();
  const { effectiveContextId: hostContextId } = useContextParams();
  const paintContextId = useCenterPaintContextId();
  const drawerNav = useTaskGithubDrawerNav();
  const openPullRequest = useGithubCenterTabsStore(
    (state) => state.openPullRequest,
  );
  const openIssue = useGithubCenterTabsStore((state) => state.openIssue);
  const openActionRun = useGithubCenterTabsStore(
    (state) => state.openActionRun,
  );
  const openCommit = useGithubCenterTabsStore(
    (state) => state.openCommit,
  );

  /**
   * Activate a center tab on `contextId`. Cross-workspace hops pass `tab` as a
   * one-shot deep link; same-host activation writes lastTab only.
   */
  const activateTab = React.useCallback(
    (value: string, contextId: string) => {
      activateCenterChromeTab(contextId, value);
      const targetHost = hostIdFromCenterKey(contextId);
      const currentHost = hostContextId ? hostIdFromCenterKey(hostContextId) : "";
      if (targetHost && targetHost !== currentHost) {
        router.push(
          `/workspace?id=${encodeURIComponent(targetHost)}&tab=${encodeURIComponent(value)}`,
        );
      }
    },
    [hostContextId, router],
  );

  const resolveContextId = React.useCallback(
    (contextId?: string | null) =>
      resolveCenterOpenContextId(contextId, hostContextId, paintContextId),
    [hostContextId, paintContextId],
  );

  const openPullRequestTab = React.useCallback(
    ({
      branch,
      label,
      owner,
      prNumber,
      repo,
      title,
      contextId,
    }: {
      branch: string;
      label?: string;
      owner: string;
      prNumber: number;
      repo: string;
      title?: string | null;
      /** Workspace (or project) context that owns the center tab. */
      contextId?: string | null;
    }) => {
      // Task GitHub nested drawer stack takes priority over center tabs.
      if (drawerNav?.active) {
        return drawerNav.openPullRequest({
          branch,
          owner,
          prNumber,
          repo,
          title,
          contextId,
        });
      }
      const targetContextId = resolveContextId(contextId);
      if (!targetContextId) return false;
      const tab = openPullRequest(targetContextId, {
        branch,
        label: label || t("pullRequest", { number: prNumber }),
        owner,
        prNumber,
        repo,
        description: title ?? undefined,
      });
      activateTab(tab.value, targetContextId);
      return true;
    },
    [activateTab, drawerNav, openPullRequest, resolveContextId, t],
  );

  const openActionRunTab = React.useCallback(
    ({
      label,
      owner,
      repo,
      run,
      runId = run.databaseId,
      contextId,
    }: {
      label?: string;
      owner: string;
      repo: string;
      run: ActionRun;
      runId?: number;
      contextId?: string | null;
    }) => {
      if (drawerNav?.active) {
        return drawerNav.openActionRun({
          owner,
          repo,
          run,
          runId,
          contextId,
        });
      }
      const targetContextId = resolveContextId(contextId);
      if (!targetContextId) return false;
      const tab = openActionRun(targetContextId, {
        label:
          label ||
          run.workflowName ||
          t("actionRun", { number: runId }),
        owner,
        repo,
        run,
        runId,
        description: run.displayTitle,
      });
      activateTab(tab.value, targetContextId);
      return true;
    },
    [activateTab, drawerNav, openActionRun, resolveContextId, t],
  );

  const openCommitTab = React.useCallback(
    ({
      owner,
      repo,
      sha,
      subject,
      authorName,
      contextId,
    }: {
      owner: string;
      repo: string;
      sha: string;
      subject: string;
      authorName: string;
      contextId?: string | null;
    }) => {
      if (drawerNav?.active) {
        return drawerNav.openCommit({
          owner,
          repo,
          sha,
          subject,
          authorName,
          contextId,
        });
      }
      const targetContextId = resolveContextId(contextId);
      if (!targetContextId) return false;
      const shortSha = sha.substring(0, 7);
      const tab = openCommit(targetContextId, {
        label: `${shortSha} ${subject}`.substring(0, 60),
        owner,
        repo,
        sha,
        subject,
        authorName,
        description: subject,
      });
      activateTab(tab.value, targetContextId);
      return true;
    },
    [activateTab, drawerNav, openCommit, resolveContextId],
  );

  const openIssueTab = React.useCallback(
    ({
      owner,
      repo,
      issueNumber,
      title,
      contextId,
    }: {
      owner: string;
      repo: string;
      issueNumber: number;
      title?: string | null;
      contextId?: string | null;
    }) => {
      if (drawerNav?.active) {
        return drawerNav.openIssue({
          owner,
          repo,
          issueNumber,
          title,
          contextId,
        });
      }
      const targetContextId = resolveContextId(contextId);
      if (!targetContextId) return false;
      const tab = openIssue(targetContextId, {
        label: t("issue", { number: issueNumber }),
        owner,
        repo,
        issueNumber,
        description: title ?? undefined,
      });
      activateTab(tab.value, targetContextId);
      return true;
    },
    [activateTab, drawerNav, openIssue, resolveContextId, t],
  );

  return { openActionRunTab, openPullRequestTab, openIssueTab, openCommitTab };
}
