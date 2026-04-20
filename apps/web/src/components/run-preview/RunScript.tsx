"use client";

import React, { useState } from 'react';
import { Play, Settings, Plus, X, Command, Lock, Unlock, Square, Skull, Loader2 } from "lucide-react";
import { Terminal } from "@/components/terminal/Terminal";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTab, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@workspace/ui";

import { useEditorStore } from '@/hooks/use-editor-store';
import { WorkspaceScriptDialog } from '@/components/dialogs/WorkspaceScriptDialog';
import { wsScriptApi } from '@/api/ws-api';
import { toastManager } from '@workspace/ui';
import type { TerminalRef } from "@/components/terminal/Terminal";

type RunTerminalTab = {
  id: string;
  name: string;
};

const RUN_TAB_ID = "1";
const RUN_TERMINAL_STORAGE_PREFIX = "atmos:run-terminal-tabs:";
const DEFAULT_RUN_TABS: RunTerminalTab[] = [{ id: RUN_TAB_ID, name: "Run" }];

function createSessionNonce(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getRunTerminalStorageKey(contextId: string): string {
  return `${RUN_TERMINAL_STORAGE_PREFIX}${contextId}`;
}

function getRunTerminalWindowName(tabId: string): string {
  return tabId === RUN_TAB_ID ? "run-main" : `run-${tabId}`;
}

function normalizeStoredTabs(value: unknown): RunTerminalTab[] {
  if (!Array.isArray(value)) return DEFAULT_RUN_TABS;

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
  return [...DEFAULT_RUN_TABS, ...withoutRun];
}

function loadStoredTabs(contextId: string): RunTerminalTab[] {
  if (typeof window === "undefined") return DEFAULT_RUN_TABS;

  try {
    const raw = window.localStorage.getItem(getRunTerminalStorageKey(contextId));
    if (!raw) return DEFAULT_RUN_TABS;
    return normalizeStoredTabs(JSON.parse(raw));
  } catch {
    return DEFAULT_RUN_TABS;
  }
}

function saveStoredTabs(contextId: string, tabs: RunTerminalTab[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getRunTerminalStorageKey(contextId),
      JSON.stringify(normalizeStoredTabs(tabs)),
    );
  } catch {
    // localStorage may be unavailable in restricted browser modes.
  }
}

interface RunScriptProps {
  workspaceId: string | null;
  projectId?: string;
  isActive: boolean;
  projectName?: string;
  workspaceName?: string;
  onDetectedUrl?: (url: string) => void;
}

export const RunScript: React.FC<RunScriptProps> = ({ workspaceId, projectId, isActive, projectName, workspaceName, onDetectedUrl }) => {

  // Initial tab
  const [tabs, setTabs] = useState<RunTerminalTab[]>(DEFAULT_RUN_TABS);
  const [activeTabId, setActiveTabId] = useState(RUN_TAB_ID);
  const currentProjectPath = useEditorStore(s => s.currentProjectPath);
  const terminalContextId = workspaceId || projectId || "";
  const sessionNonceRef = React.useRef(createSessionNonce());

  // Lazy initialization state
  const [hasBeenActive, setHasBeenActive] = React.useState(false);
  const [isScriptDialogOpen, setIsScriptDialogOpen] = useState(false);
  const [runningScripts, setRunningScripts] = useState<Record<string, boolean>>({});
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
    setSessionVersions({});

    if (!terminalContextId) {
      setTabs(DEFAULT_RUN_TABS);
      setActiveTabId(RUN_TAB_ID);
      return;
    }

    const storedTabs = loadStoredTabs(terminalContextId);
    setTabs(storedTabs);
    setActiveTabId((current) =>
      storedTabs.some((tab) => tab.id === current) ? current : RUN_TAB_ID,
    );
    setLoadedTabsContextId(terminalContextId);
  }, [terminalContextId]);

  React.useEffect(() => {
    if (!terminalContextId || loadedTabsContextId !== terminalContextId) return;
    saveStoredTabs(terminalContextId, tabs);
  }, [loadedTabsContextId, terminalContextId, tabs]);

  const handleStopScript = () => {
    const term = terminalRefs.current[activeTabId];
    if (term) {
      term.sendText("\x03"); // Send Ctrl+C
      // Reset running state immediately for better UX
      setRunningScripts(prev => {
        const newState = { ...prev };
        delete newState[activeTabId];
        return newState;
      });
    }
  };

  const handleHardStop = () => {
    const term = terminalRefs.current[activeTabId];
    if (term) {
      // 1. Destroy via backend (kills tmux window/pane and processes)
      term.destroy();
    }

    // 2. Clear running state
    setRunningScripts(prev => {
      const newState = { ...prev };
      delete newState[activeTabId];
      return newState;
    });

    // 3. Increment version to force remount with new session ID
    setSessionVersions(prev => ({
      ...prev,
      [activeTabId]: (prev[activeTabId] || 0) + 1
    }));
  };

  const handleRunScript = React.useCallback(async (force: boolean = false) => {
    if (!workspaceId || !projectId) {
      if (!projectId) {
        console.error("No projectId available for scripts");
      }
      return;
    }

    // Check if terminal is busy
    if (!force && runningScripts[activeTabId]) {
      // If user clicked run recently, treat as force
      const runClickStore = window as Window & { _lastRunClickTime?: number };
      const lastClick = runClickStore._lastRunClickTime;
      const now = Date.now();
      if (lastClick && (now - lastClick < 3000)) {
        handleRunScript(true);
        return;
      }
      runClickStore._lastRunClickTime = now;

      toastManager.add({
        title: "Terminal is busy",
        description: "Script is running. Click 'Run' again to force restart.",
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

    try {
      // 1. Fetch script
      const scripts = await wsScriptApi.get(projectId);
      const runCommand = scripts.run;

      if (!runCommand || !runCommand.trim()) {
        toastManager.add({
          title: "No Run Script Configured",
          description: "Please configure a run script in the settings.",
          type: "warning"
        });
        setIsScriptDialogOpen(true);
        return;
      }

      // 2. Get active terminal
      const term = terminalRefs.current[activeTabId];
      if (!term) {
        toastManager.add({
          title: "Terminal not ready",
          description: "Please wait for the terminal to initialize.",
          type: "error"
        });
        return;
      }

      // 3. Execute script
      // Use sendText to send to backend PTY, not write which is local only
      term.sendText(runCommand + "\r");

      // 4. Mark as running
      setRunningScripts(prev => ({ ...prev, [activeTabId]: true }));
    } catch (error) {
      console.error("Failed to run script:", error);
      toastManager.add({
        title: "Error",
        description: "Failed to load execution script.",
        type: "error"
      });
    }
  }, [activeTabId, projectId, runningScripts, workspaceId]);

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

  const handleTerminalData = (tabId: string, data: string) => {
    // If user presses Ctrl+C, assume they killed the process and mark as idle
    if (data.includes('\u0003')) {
      setRunningScripts(prev => {
        if (!prev[tabId]) return prev;
        const newState = { ...prev };
        delete newState[tabId];
        return newState;
      });
    }

    // Attempt to detect localhost URL
    // Strip ANSI codes first to ensure clean matching
    const cleanData = data.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

    // Log for debugging
    console.log('[RunScript] Terminal Data Segment:', {
      raw: JSON.stringify(data),
      clean: cleanData
    });

    // matches http://localhost:3000, http://127.0.0.1:8080, etc.
    const urlRegex = /(http:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+)/;
    const match = cleanData.match(urlRegex);
    if (match) {
      console.log('[RunScript] URL Detected:', match[1]);
      if (match[1]) {
        onDetectedUrl?.(match[1]);
      }
    }
  };

  const addTab = () => {
    const newId = String(Date.now());
    // Find next available suffix
    let suffix = 1;
    while (tabs.some(t => t.name === `Terminal-${suffix}`)) {
      suffix++;
    }
    const newName = `Terminal-${suffix}`;

    setTabs((currentTabs) => [...currentTabs, { id: newId, name: newName }]);
    setActiveTabId(newId);
  };

  const removeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    terminalRefs.current[id]?.destroy();
    const newTabs = tabs.filter(t => t.id !== id);
    if (newTabs.length === 0) return; // Keep at least one
    setTabs(newTabs);

    // Clean up running state
    const nextRunningScripts = { ...runningScripts };
    delete nextRunningScripts[id];
    setRunningScripts(nextRunningScripts);

    // Clean up ref
    if (terminalRefs.current[id]) {
      delete terminalRefs.current[id];
    }
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  // If no workspaceId or projectId, we can't really connect, but let's handle gracefully
  if (!workspaceId && !projectId) return <div className="p-4 text-muted-foreground flex items-center justify-center h-full">No active project or workspace</div>;

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
                          {isLocked ? "Unlock Terminal (Enable input)" : "Lock Terminal (Disable input)"}
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
                title="New Terminal"
              >
                <Plus className="size-3.5" />
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">

              {/* Run/Stop Button - Only visible in Run tab */}
              {activeTabId === RUN_TAB_ID && (
                <div className="flex items-center h-6 bg-background border border-border rounded-sm shadow-sm overflow-hidden cursor-pointer hover:border-primary/50 transition-colors group/run">
                  {runningScripts[activeTabId] ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleStopScript}
                          className="flex items-center gap-1.5 px-2 h-full hover:bg-muted hover:cursor-pointer transition-colors text-[11px] font-medium text-destructive hover:text-destructive"
                        >
                          <Square className="size-2.5 fill-current" />
                          <span>Stop</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        Stop Script (Sends Ctrl+C) - Useful for stopping standard processes
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleRunScript(false)}
                          className="flex items-center gap-1.5 px-2 h-full hover:bg-muted hover:cursor-pointer transition-colors text-[11px] font-medium text-foreground"
                        >
                          <Play className="size-2.5 fill-current group-hover/run:text-primary transition-colors" />
                          <span>Run</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        Run configured script (Cmd+R)
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
                    Kill Terminal Session (Force Stop) - Destroys background processes and resets session
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Lock Toggle (Removed from here) */}

              <button
                onClick={() => setIsScriptDialogOpen(true)}
                className="size-6 flex items-center justify-center hover:bg-muted hover:cursor-pointer rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                title="Configure Scripts"
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
                  <span className="text-sm">Loading Workspace...</span>
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
                  workspaceName={workspaceName || "Main"}
                  terminalName={getRunTerminalWindowName(tab.id)}
                  tmuxWindowName={getRunTerminalWindowName(tab.id)}
                  isNewPane={true}
                  cwd={currentProjectPath}
                  onData={(data) => handleTerminalData(tab.id, data)}
                  readOnly={tab.id === RUN_TAB_ID ? isLocked : false}
                  onInputWhileReadOnly={() => {
                    const now = Date.now();
                    if (now - lastLockedToastTime.current >= 3000) {
                      lastLockedToastTime.current = now;
                      toastManager.add({
                        title: "Terminal is Locked",
                        description: "Unlock the terminal to interact with it.",
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
      </div>
    </TooltipProvider>
  )
}
