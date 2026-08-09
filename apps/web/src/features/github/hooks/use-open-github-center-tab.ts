"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import type { ActionRun } from "@/features/github/components/ActionsPanel";
import { useGithubCenterTabsStore } from "@/features/github/store/use-github-center-tabs";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";
import { useTaskGithubDrawerNav } from "@/features/task/components/task-github-drawer/task-github-drawer-nav-context";

export function useOpenGithubCenterTab() {
  const t = useTranslations("github.centerTabs");
  const router = useAppRouter();
  const { effectiveContextId } = useContextParams();
  const [, setCenterStageParams] = useQueryStates(centerStageParams);
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
  const setActiveFile = useEditorStore((state) => state.setActiveFile);

  /**
   * Activate a center tab on `contextId`. When opening for another workspace,
   * navigate there with `tab` in the query so the surface switch keeps it.
   */
  const activateTab = React.useCallback(
    (value: string, contextId: string) => {
      setActiveFile(null, contextId);
      if (contextId !== effectiveContextId) {
        router.push(
          `/workspace?id=${encodeURIComponent(contextId)}&tab=${encodeURIComponent(value)}`,
        );
        return;
      }
      void setCenterStageParams({ tab: value, wikiPage: null });
    },
    [effectiveContextId, router, setActiveFile, setCenterStageParams],
  );

  const resolveContextId = React.useCallback(
    (contextId?: string | null) => contextId || effectiveContextId || null,
    [effectiveContextId],
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
