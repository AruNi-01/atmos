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
  const openActionRun = useGithubCenterTabsStore(
    (state) => state.openActionRun,
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
    }: {
      branch: string;
      label?: string;
      owner: string;
      prNumber: number;
      repo: string;
    }) => {
      if (!effectiveContextId) return;
      const tab = openPullRequest(effectiveContextId, {
        branch,
        label: label || t("pullRequest", { number: prNumber }),
        owner,
        prNumber,
        repo,
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
          run.displayTitle ||
          t("actionRun", { number: runId }),
        owner,
        repo,
        run,
        runId,
      });
      activateTab(tab.value);
    },
    [activateTab, effectiveContextId, openActionRun, t],
  );

  return { openActionRunTab, openPullRequestTab };
}
