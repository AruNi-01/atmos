"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Skeleton } from "@workspace/ui";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { useWikiContext } from "@/hooks/use-wiki-store";
import { WikiSetup } from "./WikiSetup";
import { WikiViewer } from "./WikiViewer";
import type { TerminalGridHandle } from "@/components/terminal/TerminalGrid";

interface WikiTabProps {
  contextId: string;
  effectivePath: string;
  projectName?: string;
  /** Parent project ID (used for "Go to Project" navigation in workspace context) */
  projectId?: string;
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
  /** True when viewing from a Workspace context (read-only: no generate/update/specify) */
  isWorkspaceContext?: boolean;
}

export const WikiTab: React.FC<WikiTabProps> = ({
  contextId,
  effectivePath,
  projectName,
  projectId,
  refreshTrigger = 0,
  terminalGridRef,
  onSwitchToTerminal,
  onSwitchToProjectWikiAndRun,
  onProjectWikiReplaceAndRun,
  wikiPage,
  onWikiPageChange,
  isWikiTabActive = false,
  isWorkspaceContext = false,
}) => {
  const router = useRouter();
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
    if (isWorkspaceContext) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
          <BookOpen className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">No wiki found for this project</p>
          <p className="text-xs text-muted-foreground/70 max-w-sm text-center">
            Wiki generation is only available from the Project view. Switch to the parent Project to generate a wiki.
          </p>
          {projectId && (
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={() => router.push(`/project?id=${projectId}&tab=wiki`)}
            >
              Go to Project
              <ArrowUpRight className="size-3.5 ml-1" />
            </Button>
          )}
        </div>
      );
    }
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
      isWorkspaceContext={isWorkspaceContext}
      terminalGridRef={terminalGridRef}
      onSwitchToTerminal={onSwitchToTerminal}
      onSwitchToProjectWikiAndRun={onSwitchToProjectWikiAndRun}
      onProjectWikiReplaceAndRun={onProjectWikiReplaceAndRun}
    />
  );
};
