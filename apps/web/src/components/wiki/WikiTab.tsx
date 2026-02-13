"use client";

import React, { useEffect } from "react";
import { Skeleton } from "@workspace/ui";
import { useWikiContext } from "@/hooks/use-wiki-store";
import { WikiSetup } from "./WikiSetup";
import { WikiViewer } from "./WikiViewer";
import type { TerminalGridHandle } from "@/components/terminal/TerminalGrid";

interface WikiTabProps {
  contextId: string;
  effectivePath: string;
  projectName?: string;
  /** Increment to trigger full reload (check exists + load catalog + reload current page) */
  refreshTrigger?: number;
  terminalGridRef: React.RefObject<TerminalGridHandle | null>;
  onSwitchToTerminal: () => void;
  /** Switch to Project Wiki tab and run the given command in its terminal */
  onSwitchToProjectWikiAndRun?: (command: string) => void;
  /** Kill existing Project Wiki window, remount terminal, then run command (for replace flow) */
  onProjectWikiReplaceAndRun?: (command: string) => Promise<void>;
  /** Current wiki page from URL (e.g. "overview/index") */
  wikiPage?: string;
  /** Called when wiki page changes — syncs to URL */
  onWikiPageChange: (page: string) => void;
  /** Whether the Wiki tab is currently active (avoids switching tab on auto-load first page) */
  isWikiTabActive?: boolean;
}

export const WikiTab: React.FC<WikiTabProps> = ({
  contextId,
  effectivePath,
  projectName,
  refreshTrigger = 0,
  terminalGridRef,
  onSwitchToTerminal,
  onSwitchToProjectWikiAndRun,
  onProjectWikiReplaceAndRun,
  wikiPage,
  onWikiPageChange,
  isWikiTabActive = false,
}) => {
  const {
    wikiExists,
    activePage,
    checkWikiExists,
    loadCatalog,
    loadPage,
  } = useWikiContext(contextId);

  useEffect(() => {
    if (!effectivePath) return;
    checkWikiExists(effectivePath);
  }, [contextId, effectivePath, checkWikiExists]);

  useEffect(() => {
    if (wikiExists === true && effectivePath) {
      loadCatalog(effectivePath);
    }
  }, [wikiExists, effectivePath, loadCatalog]);

  useEffect(() => {
    if (refreshTrigger > 0 && effectivePath) {
      checkWikiExists(effectivePath);
      loadCatalog(effectivePath);
      if (activePage) {
        const filePath = activePage.endsWith(".md") ? activePage : `${activePage}.md`;
        loadPage(effectivePath, filePath);
      }
    }
  }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetryCheck = () => {
    checkWikiExists(effectivePath);
  };

  if (wikiExists === null) {
    return (
      <div className="flex flex-col gap-4 p-6 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    );
  }

  if (wikiExists === false) {
    return (
      <WikiSetup
        effectivePath={effectivePath}
        workspaceId={contextId}
        terminalGridRef={terminalGridRef}
        onSwitchToTerminal={onSwitchToTerminal}
        onSwitchToProjectWikiAndRun={onSwitchToProjectWikiAndRun}
        onProjectWikiReplaceAndRun={onProjectWikiReplaceAndRun}
        onRetryCheck={handleRetryCheck}
      />
    );
  }

  return (
    <WikiViewer
      contextId={contextId}
      effectivePath={effectivePath}
      projectName={projectName}
      wikiPage={wikiPage}
      onWikiPageChange={onWikiPageChange}
      isWikiTabActive={isWikiTabActive}
      terminalGridRef={terminalGridRef}
      onSwitchToTerminal={onSwitchToTerminal}
      onSwitchToProjectWikiAndRun={onSwitchToProjectWikiAndRun}
      onProjectWikiReplaceAndRun={onProjectWikiReplaceAndRun}
    />
  );
};
