"use client";

import React, { useState } from 'react';
import { Play, Settings, Plus, X, Command, Lock, Unlock, Square, Skull, Loader2, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Terminal } from "@/features/terminal/components/Terminal";
import { cn } from "@/shared/lib/utils";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsList,
  TabsTab,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";

import { useEditorStore } from '@/features/editor/store/use-editor-store';
import { WorkspaceScriptDialog } from '@/features/workspace/components/WorkspaceScriptDialog';
import { ScriptTrustReview } from '@/shared/components/ScriptTrustReview';
import { wsScriptApi } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';
import type { TerminalRef } from "@/features/terminal/components/Terminal";
import { getActiveInstanceId } from '@/features/connection/store/connection-store';
import { useUiPrefStore } from '@/shared/stores/use-ui-pref-store';
import { isRunTerminalBusyFromTitle } from "@/features/browser/lib/run-terminal-busy";
import { runLogApi } from "@/features/browser/lib/run-log-api";

type RunTerminalTab = {
  id: string;
  name: string;
};

const RUN_TAB_ID = "1";

function createDefaultRunTabs(runLabel: string): RunTerminalTab[] {
  return [{ id: RUN_TAB_ID, name: runLabel }];
}

function createSessionNonce(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getRunTerminalWindowName(tabId: string): string {
  return tabId === RUN_TAB_ID ? "run-main" : `run-${tabId}`;
}

function normalizeStoredTabs(value: unknown, runLabel: string): RunTerminalTab[] {
  if (!Array.isArray(value)) return createDefaultRunTabs(runLabel);

  const normalized = value
    .filter((tab): tab is RunTerminalTab => {
      return (
        !!tab &&
        typeof tab === "object" &&
        typeof (tab as RunTerminalTab).id === "string" &&
        typeof (tab as RunTerminalTab).name === "string"
      );
    })
    .filter((tab) => tab.id.trim() && tab.name.trim());

  const withoutRun = normalized.filter((tab) => tab.id !== RUN_TAB_ID);
  return [...createDefaultRunTabs(runLabel), ...withoutRun];
}

function loadStoredTabs(contextId: string, runLabel: string): RunTerminalTab[] {
  if (typeof window === "undefined") return createDefaultRunTabs(runLabel);
  const instanceId = getActiveInstanceId();
  const all = useUiPrefStore.getState().readSlice(instanceId, 'run', {
    byContext: {} as Record<string, RunTerminalTab[]>,
  });
  return normalizeStoredTabs(all.byContext[contextId], runLabel);
}

function saveStoredTabs(contextId: string, tabs: RunTerminalTab[], runLabel: string) {
  if (typeof window === "undefined") return;
  const instanceId = getActiveInstanceId();
  const normalized = normalizeStoredTabs(tabs, runLabel);
  useUiPrefStore.getState().patchSlice(
    instanceId,
    'run',
    prev => ({
      byContext: {
        ...(prev as { byContext: Record<string, RunTerminalTab[]> }).byContext,
        [contextId]: normalized,
      },
    }),
    { byContext: {} },
  );
}

interface RunScriptProps {
  workspaceId: string | null;
  projectId?: string;
  isActive: boolean;
  projectName?: string;
  workspaceName?: string;
}

export const RunScript: React.FC<RunScriptProps> = ({ workspaceId, projectId, isActive, projectName, workspaceName }) => {
  const t = useTranslations("run");
  const runTabLabel = t("tabs.run");
  const defaultRunTabs = React.useMemo(() => createDefaultRunTabs(runTabLabel), [runTabLabel]);
  const terminalTabName = React.useCallback((index: number) => t("tabs.terminal", { index }), [t]);
  const terminalBusyTitle = t("toasts.terminalBusy.title");
  const terminalBusyDescription = t("toasts.terminalBusy.description", { runAction: runTabLabel });
  const noRunScriptTitle = t("toasts.noRunScript.title");
  const noRunScriptDescription = t("toasts.noRunScript.description");
  const terminalNotReadyTitle = t("toasts.terminalNotReady.title");
  const terminalNotReadyDescription = t("toasts.terminalNotReady.description");
  const noProjectTitle = t("toasts.noProject.title");
  const noProjectDescription = t("toasts.noProject.description");
  const errorTitle = t("toasts.error.title");
  const runScriptLoadErrorDescription = t("toasts.error.runScriptLoadDescription");
  const noActiveProjectMessage = t("emptyState.noActiveProject");
  const lockTerminalTooltip = t("tooltips.lockTerminal");
  const unlockTerminalTooltip = t("tooltips.unlockTerminal");
  const newTerminalLabel = t("actions.newTerminal");
  const stopLabel = t("actions.stop");
  const stopScriptTooltip = t("tooltips.stopScript");
  const runActionLabel = t("actions.run");
  const runConfiguredScriptTooltip = t("tooltips.runConfiguredScript", { shortcut: "Cmd+R" });
  const hardStopTooltip = t("tooltips.hardStop");
  const configureScriptsLabel = t("actions.configureScripts");
  const loadingWorkspaceLabel = t("loading.workspace");
  const mainWorkspaceLabel = t("workspace.main");
  const terminalLockedTitle = t("toasts.terminalLocked.title");
  const terminalLockedDescription = t("toasts.terminalLocked.description");
  const scriptTrustTitle = t("scriptTrust.title");
  const scriptTrustDescription = t("scriptTrust.description");
  const scriptTrustConfirmLabel = t("scriptTrust.trustAndRun");
  const scriptTrustCancelLabel = t("scriptTrust.cancel");
  const scriptTrustTrustingLabel = t("scriptTrust.trusting");
  const scriptTrustFailedTitle = t("scriptTrust.trustFailed");

  // Initial tab
  const [tabs, setTabs] = useState<RunTerminalTab[]>(defaultRunTabs);
  const [activeTabId, setActiveTabId] = useState(RUN_TAB_ID);
  const currentProjectPath = useEditorStore(s => s.currentProjectPath);
  const terminalContextId = workspaceId || projectId || "";
  const sessionNonceRef = React.useRef(createSessionNonce());

  // Lazy initialization state
  const [hasBeenActive, setHasBeenActive] = React.useState(false);
  const [isScriptDialogOpen, setIsScriptDialogOpen] = useState(false);
  /**
   * Set when the run script has not been accepted yet. The `.atmos` script file
   * ships with the repository, so it can change under the user via clone or pull;
   * the command is shown for review before it reaches a terminal.
   */
  const [pendingScriptTrust, setPendingScriptTrust] = useState<
    { scripts: Record<string, string>; hash: string } | null
  >(null);
  const [isTrustingScript, setIsTrustingScript] = useState(false);
  const [runningScripts, setRunningScripts] = useState<Record<string, boolean>>({});
  const [readyTabs, setReadyTabs] = useState<Record<string, boolean>>({});
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [sessionVersions, setSessionVersions] = useState<Record<string, number>>({});
  const [loadedTabsContextId, setLoadedTabsContextId] = useState<string | null>(null);
  const terminalRefs = React.useRef<Record<string, TerminalRef | null>>({});
  const lastLockedToastTime = React.useRef<number>(0);

  React.useEffect(() => {
    if (isActive && !hasBeenActive) {
      setHasBeenActive(true);
    }
  }, [isActive, hasBeenActive]);

  React.useEffect(() => {
    setLoadedTabsContextId(null);
    terminalRefs.current = {};
    setRunningScripts({});
    setReadyTabs({});
    setIsStartingRun(false);
    setSessionVersions({});

    if (!terminalContextId) {
      setTabs(defaultRunTabs);
      setActiveTabId(RUN_TAB_ID);
      return;
    }

    const storedTabs = loadStoredTabs(terminalContextId, runTabLabel);
    setTabs(storedTabs);
    setActiveTabId((current) =>
      storedTabs.some((tab) => tab.id === current) ? current : RUN_TAB_ID,
    );
    setLoadedTabsContextId(terminalContextId);
  }, [defaultRunTabs, runTabLabel, terminalContextId]);

  React.useEffect(() => {
    if (!terminalContextId || loadedTabsContextId !== terminalContextId) return;
    saveStoredTabs(terminalContextId, tabs, runTabLabel);
  }, [loadedTabsContextId, runTabLabel, tabs, terminalContextId]);

  const setTabRunning = React.useCallback((tabId: string, running: boolean) => {
    setRunningScripts((prev) => {
      const currentlyRunning = Boolean(prev[tabId]);
      if (currentlyRunning === running) return prev;
      if (!running) {
        if (!(tabId in prev)) return prev;
        const next = { ...prev };
        delete next[tabId];
        return next;
      }
      return { ...prev, [tabId]: true };
    });
  }, []);

  const handleShellTitleChange = React.useCallback(
    (tabId: string, title: string) => {
      // Authoritative busy state from shell shim OSC (CMD_START / CMD_END)
      // and backend inject_initial_title on attach/reconnect.
      setTabRunning(tabId, isRunTerminalBusyFromTitle(title));
    },
    [setTabRunning],
  );

  const handleStopScript = () => {
    const term = terminalRefs.current[activeTabId];
    if (term) {
      term.sendText("\x03"); // Send Ctrl+C
      // Optimistic idle; CMD_END from the shim will confirm shortly.
      setTabRunning(activeTabId, false);
    }
  };

  const handleHardStop = () => {
    const term = terminalRefs.current[activeTabId];
    if (term) {
      // 1. Destroy via backend (kills tmux window/pane and processes)
      term.destroy();
    }

    // 2. Optimistic idle until the remounted session reports its title
    setTabRunning(activeTabId, false);
    setReadyTabs((prev) => {
      if (!(activeTabId in prev)) return prev;
      const next = { ...prev };
      delete next[activeTabId];
      return next;
    });

    // 3. Increment version to force remount with new session ID
    setSessionVersions(prev => ({
      ...prev,
      [activeTabId]: (prev[activeTabId] || 0) + 1
    }));
  };

  const markTabReady = React.useCallback((tabId: string) => {
    setReadyTabs((prev) => {
      if (prev[tabId]) return prev;
      return { ...prev, [tabId]: true };
    });
  }, []);

  const handleRunScript = React.useCallback(async (force: boolean = false) => {
    // Host sets isActive=false while deferred URL context is unsettled.
    // Running during that window can load/send against the prior project.
    if (!isActive) return;

    // Scripts are project-scoped. Terminal attaches via workspaceId || projectId
    // (project main path is a valid context), so do not require both IDs.
    if (!projectId) {
      toastManager.add({
        title: noProjectTitle,
        description: noProjectDescription,
        type: "warning",
      });
      return;
    }

    if (!currentProjectPath) {
      toastManager.add({
        title: terminalNotReadyTitle,
        description: terminalNotReadyDescription,
        type: "error",
      });
      return;
    }

    // Check if terminal is busy
    if (!force && runningScripts[activeTabId]) {
      // If user clicked run recently, treat as force
      const runClickStore = window as Window & { _lastRunClickTime?: number };
      const lastClick = runClickStore._lastRunClickTime;
      const now = Date.now();
      if (lastClick && (now - lastClick < 3000)) {
        void handleRunScript(true);
        return;
      }
      runClickStore._lastRunClickTime = now;

      toastManager.add({
        title: terminalBusyTitle,
        description: terminalBusyDescription,
        type: "info"
      });
      return;
    }

    // If forcing, send Ctrl+C first to ensure previous process is killed
    if (force) {
      const term = terminalRefs.current[activeTabId];
      if (term) {
        term.sendText("\x03"); // Send Ctrl+C
      }
    }

    setIsStartingRun(true);
    try {
      // 1. Fetch script
      const { scripts, trusted, hash } = await wsScriptApi.get(projectId);
      const runCommand = scripts.run;

      // Never hand unreviewed repository content to a terminal. Trust covers the
      // whole file, so review shows every command in it, not just `run`.
      if (runCommand?.trim() && !trusted && hash) {
        setPendingScriptTrust({ scripts, hash });
        return;
      }

      if (!runCommand || !runCommand.trim()) {
        toastManager.add({
          title: noRunScriptTitle,
          description: noRunScriptDescription,
          type: "warning"
        });
        setIsScriptDialogOpen(true);
        return;
      }

      // 2. Get active terminal (ref may exist before the PTY session is attached)
      const term = terminalRefs.current[activeTabId];
      if (!term || !readyTabs[activeTabId]) {
        toastManager.add({
          title: terminalNotReadyTitle,
          description: terminalNotReadyDescription,
          type: "error"
        });
        return;
      }

      // 3. APP-055: rotate/open project-local Run log before command output arrives
      void runLogApi
        .start({
          projectRoot: currentProjectPath,
          windowName: getRunTerminalWindowName(activeTabId),
          command: runCommand,
        })
        .catch((error) => {
          console.warn("Failed to start Run log capture", error);
        });

      // 4. Execute script
      // Use sendText to send to backend PTY, not write which is local only
      term.sendText(runCommand + "\r");

      // 5. Optimistic running; CMD_START title will confirm (and CMD_END will clear)
      setTabRunning(activeTabId, true);
    } catch (error) {
      console.error("Failed to run script:", error);
      toastManager.add({
        title: errorTitle,
        description: runScriptLoadErrorDescription,
        type: "error"
      });
    } finally {
      setIsStartingRun(false);
    }
  }, [
    activeTabId,
    currentProjectPath,
    errorTitle,
    isActive,
    noProjectDescription,
    noProjectTitle,
    noRunScriptDescription,
    noRunScriptTitle,
    projectId,
    readyTabs,
    runScriptLoadErrorDescription,
    runningScripts,
    setTabRunning,
    terminalBusyDescription,
    terminalBusyTitle,
    terminalNotReadyDescription,
    terminalNotReadyTitle,
  ]);

  // Keyboard shortcut Cmd+R
  React.useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault();
        handleRunScript(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRunScript, isActive]);

  const addTab = () => {
    const newId = String(Date.now());
    // Find next available suffix
    let suffix = 1;
    while (tabs.some(tab => tab.name === terminalTabName(suffix))) {
      suffix++;
    }
    const newName = terminalTabName(suffix);

    setTabs((currentTabs) => [...currentTabs, { id: newId, name: newName }]);
    setActiveTabId(newId);
  };

  const removeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    terminalRefs.current[id]?.destroy();
    const newTabs = tabs.filter(t => t.id !== id);
    if (newTabs.length === 0) return; // Keep at least one
    setTabs(newTabs);

    // Clean up running state for the closed tab
    setTabRunning(id, false);
    setReadyTabs((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });

    // Clean up ref
    if (terminalRefs.current[id]) {
      delete terminalRefs.current[id];
    }
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  const isActiveRunBusy = Boolean(runningScripts[activeTabId]);
  const canStartRun =
    isActive &&
    Boolean(projectId) &&
    Boolean(currentProjectPath) &&
    Boolean(readyTabs[activeTabId]) &&
    !isStartingRun;

  // If no workspaceId or projectId, we can't really connect, but let's handle gracefully
  if (!workspaceId && !projectId) return <div className="p-4 text-muted-foreground flex items-center justify-center h-full">{noActiveProjectMessage}</div>;

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full w-full bg-background">
        {/* Header */}
        <Tabs
          value={activeTabId}
          onValueChange={setActiveTabId}
          className="flex flex-col h-full w-full"
        >
          <div className="flex items-center justify-between px-2 h-9 border-b border-border bg-muted/20 shrink-0">
            <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden no-scrollbar flex-1 mr-2 h-full">
              <TabsList variant='underline' className="h-full bg-transparent p-0 gap-1 border-b-0 w-auto justify-start">
                {tabs.map(tab => (
                  <TabsTab
                    key={tab.id}
                    value={tab.id}
                    className="group relative h-full px-2 border-b-2 border-transparent data-[state=active]:border-primary bg-transparent text-muted-foreground data-[state=active]:text-foreground transition-all select-none min-w-0 inline-flex items-center justify-center"
                  >
                    <span className="text-[11px] font-medium truncate max-w-[120px]">
                      {tab.name}
                    </span>

                    {/* Tab Actions: Close (for new tabs) or Lock (for Run tab) */}
                    {tab.id === RUN_TAB_ID ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsLocked(!isLocked);
                            }}
                            className={cn(
                              "ml-1 p-1 rounded-sm transition-all dark:hover:bg-zinc-900 hover:bg-zinc-200 shrink-0 z-10",
                              isLocked ? "text-primary" : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {isLocked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isLocked ? unlockTerminalTooltip : lockTerminalTooltip}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <div
                        className={cn(
                          "absolute right-0 top-1/2 -translate-y-1/2 w-16 h-full flex items-center justify-end pr-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        )}
                      >
                        <span
                          role="button"
                          onClick={(e) => removeTab(e, tab.id)}
                          className="p-1 bg-muted rounded-sm transition-all text-foreground dark:hover:bg-zinc-900 hover:bg-zinc-200"
                        >
                          <X className="size-3.5" />
                        </span>
                      </div>
                    )}
                  </TabsTab>
                ))}
              </TabsList>


              <button
                onClick={addTab}
                className="p-1 hover:bg-muted hover:cursor-pointer rounded-sm text-muted-foreground hover:text-foreground transition-colors ml-1 shrink-0"
                title={newTerminalLabel}
              >
                <Plus className="size-3.5" />
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">

              {/* Run/Stop Button - Only visible in Run tab */}
              {activeTabId === RUN_TAB_ID && (
                <div className="flex items-center h-6 bg-background border border-border rounded-sm shadow-sm overflow-hidden hover:border-primary/50 transition-colors group/run">
                  {isActiveRunBusy ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={handleStopScript}
                          className="flex items-center gap-1.5 px-2 h-full hover:bg-muted hover:cursor-pointer transition-colors text-[11px] font-medium text-destructive hover:text-destructive"
                        >
                          <Square className="size-2.5 fill-current" />
                          <span>{stopLabel}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {stopScriptTooltip}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            void handleRunScript(false);
                          }}
                          disabled={isStartingRun}
                          className={cn(
                            "flex items-center gap-1.5 px-2 h-full transition-colors text-[11px] font-medium text-foreground",
                            isStartingRun
                              ? "cursor-wait opacity-70"
                              : "hover:bg-muted hover:cursor-pointer",
                            !canStartRun && !isStartingRun && "opacity-70",
                          )}
                        >
                          {isStartingRun ? (
                            <Loader2 className="size-2.5 animate-spin" />
                          ) : (
                            <Play className="size-2.5 fill-current group-hover/run:text-primary transition-colors" />
                          )}
                          <span>{runActionLabel}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {runConfiguredScriptTooltip}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  <div className="w-px h-full bg-border" />
                  <span className="flex items-center justify-center hover:cursor-default px-1.5 text-[9px] text-muted-foreground bg-muted/30 h-full">
                    <Command className="size-2 mr-0.5" /> R
                  </span>
                </div>
              )}

              {/* Hard Stop Button - To handle background processes */}
              {activeTabId === RUN_TAB_ID && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleHardStop}
                      className="size-6 flex items-center justify-center hover:bg-muted hover:cursor-pointer rounded-sm text-muted-foreground hover:text-destructive transition-colors ml-1"
                    >
                      <Skull className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {hardStopTooltip}
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Lock Toggle (Removed from here) */}

              <button
                onClick={() => setIsScriptDialogOpen(true)}
                className="size-6 flex items-center justify-center hover:bg-muted hover:cursor-pointer rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                title={configureScriptsLabel}
              >
                <Settings className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden relative">
            {hasBeenActive && !currentProjectPath && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-background">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  <span className="text-sm">{loadingWorkspaceLabel}</span>
                </div>
              </div>
            )}
            {hasBeenActive && currentProjectPath && tabs.map(tab => (
              <div
                key={tab.id}
                className={cn("absolute inset-0", activeTabId === tab.id ? "z-10" : "z-0 invisible")}
              >
                <Terminal
                  ref={(el) => { terminalRefs.current[tab.id] = el; }}
                  sessionId={`${sessionNonceRef.current}-run-script-${terminalContextId}-${tab.id}-${sessionVersions[tab.id] || 0}`}
                  workspaceId={terminalContextId}
                  projectName={projectName}
                  workspaceName={workspaceName || mainWorkspaceLabel}
                  terminalName={getRunTerminalWindowName(tab.id)}
                  tmuxWindowName={getRunTerminalWindowName(tab.id)}
                  isNewPane={true}
                  cwd={currentProjectPath}
                  onSessionReady={() => markTabReady(tab.id)}
                  onTitleChange={(title) => handleShellTitleChange(tab.id, title)}
                  readOnly={tab.id === RUN_TAB_ID ? isLocked : false}
                  onInputWhileReadOnly={() => {
                    const now = Date.now();
                    if (now - lastLockedToastTime.current >= 3000) {
                      lastLockedToastTime.current = now;
                      toastManager.add({
                        title: terminalLockedTitle,
                        description: terminalLockedDescription,
                        type: "info"
                      });
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </Tabs>

        <WorkspaceScriptDialog
          projectId={projectId || null}
          isOpen={isScriptDialogOpen}
          onClose={() => setIsScriptDialogOpen(false)}
        />

        <Dialog
          open={pendingScriptTrust !== null}
          onOpenChange={(open) => {
            if (!open) setPendingScriptTrust(null);
          }}
        >
          <DialogContent showCloseButton={true}>
            <DialogHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10">
                <ShieldAlert className="size-5 text-destructive" />
              </div>
              <DialogTitle>{scriptTrustTitle}</DialogTitle>
              <DialogDescription className="text-pretty">
                {scriptTrustDescription}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-56 overflow-auto">
              <ScriptTrustReview
                scripts={pendingScriptTrust?.scripts ?? {}}
                highlightField="run"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className="cursor-pointer"
                disabled={isTrustingScript}
                onClick={() => setPendingScriptTrust(null)}
              >
                {scriptTrustCancelLabel}
              </Button>
              <Button
                variant="destructive"
                className="cursor-pointer"
                disabled={isTrustingScript}
                onClick={async () => {
                  if (!projectId || !pendingScriptTrust) return;
                  setIsTrustingScript(true);
                  try {
                    // The hash pins the content shown above; a file that changed
                    // since is rejected by the server rather than trusted blindly.
                    await wsScriptApi.trust(projectId, pendingScriptTrust.hash);
                    setPendingScriptTrust(null);
                    await handleRunScript(false);
                  } catch (error) {
                    toastManager.add({
                      title: scriptTrustFailedTitle,
                      description: error instanceof Error ? error.message : String(error),
                      type: "error",
                    });
                  } finally {
                    setIsTrustingScript(false);
                  }
                }}
              >
                {isTrustingScript ? (
                  <>
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                    {scriptTrustTrustingLabel}
                  </>
                ) : (
                  scriptTrustConfirmLabel
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
