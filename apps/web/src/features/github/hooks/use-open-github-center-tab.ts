"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import type { ActionRun } from "@/features/github/components/ActionsPanel";
import { useGithubCenterTabsStore } from "@/features/github/store/use-github-center-tabs";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useContextParams } from "@/shared/hooks/use-context-params";
import { centerStageParams } from "@/shared/lib/nuqs/searchParams";

export function useOpenGithubCenterTab() {
  const t = useTranslations("github.centerTabs");
  const { effectiveContextId } = useContextParams();
  const [, setCenterStageParams] = useQueryStates(centerStageParams);
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

  const activateTab = React.useCallback(
    (value: string) => {
      if (!effectiveContextId) return;
      setActiveFile(null, effectiveContextId);
      void setCenterStageParams({ tab: value, wikiPage: null });
    },
    [effectiveContextId, setActiveFile, setCenterStageParams],
  );

  const openPullRequestTab = React.useCallback(
    ({
      branch,
      label,
      owner,
      prNumber,
      repo,
      title,
    }: {
      branch: string;
      label?: string;
      owner: string;
      prNumber: number;
      repo: string;
      title?: string | null;
    }) => {
      if (!effectiveContextId) return;
      const tab = openPullRequest(effectiveContextId, {
        branch,
        label: label || t("pullRequest", { number: prNumber }),
        owner,
        prNumber,
        repo,
        description: title ?? undefined,
      });
      activateTab(tab.value);
    },
    [activateTab, effectiveContextId, openPullRequest, t],
  );

  const openActionRunTab = React.useCallback(
    ({
      label,
      owner,
      repo,
      run,
      runId = run.databaseId,
    }: {
      label?: string;
      owner: string;
      repo: string;
      run: ActionRun;
      runId?: number;
    }) => {
      if (!effectiveContextId) return;
      const tab = openActionRun(effectiveContextId, {
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
      activateTab(tab.value);
    },
    [activateTab, effectiveContextId, openActionRun, t],
  );

  const openCommitTab = React.useCallback(
    ({
      owner,
      repo,
      sha,
      subject,
      authorName,
    }: {
      owner: string;
      repo: string;
      sha: string;
      subject: string;
      authorName: string;
    }) => {
      if (!effectiveContextId) return;
      const shortSha = sha.substring(0, 7);
      const tab = openCommit(effectiveContextId, {
        label: `${shortSha} ${subject}`.substring(0, 60),
        owner,
        repo,
        sha,
        subject,
        authorName,
        description: subject,
      });
      activateTab(tab.value);
    },
    [activateTab, effectiveContextId, openCommit],
  );

  const openIssueTab = React.useCallback(
    ({ owner, repo, issueNumber, title }: {
      owner: string;
      repo: string;
      issueNumber: number;
      title?: string | null;
    }) => {
      if (!effectiveContextId) return;
      const tab = openIssue(effectiveContextId, {
        label: t("issue", { number: issueNumber }),
        owner, repo, issueNumber, description: title ?? undefined,
      });
      activateTab(tab.value);
    },
    [activateTab, effectiveContextId, openIssue, t],
  );

  return { openActionRunTab, openPullRequestTab, openIssueTab, openCommitTab };
}
