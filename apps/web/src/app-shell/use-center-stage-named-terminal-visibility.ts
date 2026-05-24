"use client";

import React from "react";
import { systemApi } from "@/api/rest-api";

interface UseCenterStageNamedTerminalVisibilityOptions {
  currentTab: string | null;
  effectiveContextId: string | null;
  isSetupBlocking: boolean;
  onMissingCodeReviewTab: () => void;
  onMissingProjectWikiTab: () => void;
}

export function useCenterStageNamedTerminalVisibility({
  currentTab,
  effectiveContextId,
  isSetupBlocking,
  onMissingCodeReviewTab,
  onMissingProjectWikiTab,
}: UseCenterStageNamedTerminalVisibilityOptions) {
  const [projectWikiVisibleMap, setProjectWikiVisibleMap] = React.useState<Record<string, boolean>>({});
  const [codeReviewVisibleMap, setCodeReviewVisibleMap] = React.useState<Record<string, boolean>>({});
  const projectWikiUserTriggeredRef = React.useRef(false);
  const codeReviewUserTriggeredRef = React.useRef(false);

  const projectWikiTabVisible = effectiveContextId
    ? (projectWikiVisibleMap[effectiveContextId] ?? false)
    : false;
  const codeReviewTabVisible = effectiveContextId
    ? (codeReviewVisibleMap[effectiveContextId] ?? false)
    : false;

  // Redirect only when the backing named terminal is absent. Avoid depending on
  // URL tab changes so a user-triggered launch cannot race the existence check.
  React.useEffect(() => {
    if (isSetupBlocking) return;
    if (!effectiveContextId) return;
    const ctxId = effectiveContextId;
    systemApi.checkProjectWikiWindow(ctxId).then(
      ({ exists }) => {
        if (projectWikiUserTriggeredRef.current) return;
        setProjectWikiVisibleMap(prev => ({ ...prev, [ctxId]: exists }));
        if (currentTab === "project-wiki" && !exists) {
          onMissingProjectWikiTab();
        }
      },
      () => {
        if (projectWikiUserTriggeredRef.current) return;
        setProjectWikiVisibleMap(prev => ({ ...prev, [ctxId]: false }));
        if (currentTab === "project-wiki") {
          onMissingProjectWikiTab();
        }
      },
    );
  }, [currentTab, effectiveContextId, isSetupBlocking, onMissingProjectWikiTab]);

  React.useEffect(() => {
    if (isSetupBlocking) return;
    if (!effectiveContextId) return;
    const ctxId = effectiveContextId;
    systemApi.checkCodeReviewWindow(ctxId).then(
      ({ exists }) => {
        if (codeReviewUserTriggeredRef.current) return;
        setCodeReviewVisibleMap(prev => ({ ...prev, [ctxId]: exists }));
        if (currentTab === "code-review" && !exists) {
          onMissingCodeReviewTab();
        }
      },
      () => {
        if (codeReviewUserTriggeredRef.current) return;
        setCodeReviewVisibleMap(prev => ({ ...prev, [ctxId]: false }));
        if (currentTab === "code-review") {
          onMissingCodeReviewTab();
        }
      },
    );
  }, [currentTab, effectiveContextId, isSetupBlocking, onMissingCodeReviewTab]);

  return {
    codeReviewTabVisible,
    codeReviewUserTriggeredRef,
    projectWikiTabVisible,
    projectWikiUserTriggeredRef,
    setCodeReviewVisibleMap,
    setProjectWikiVisibleMap,
  };
}
