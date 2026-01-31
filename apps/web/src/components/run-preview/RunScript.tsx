"use client";

import React, { useState } from 'react';
import { Play, Settings, Plus, X, Command } from "lucide-react";
import { Terminal } from "@/components/terminal/Terminal";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTab } from "@workspace/ui";

import { useEditorStore } from '@/hooks/use-editor-store';

interface RunScriptProps {
  workspaceId: string | null;
  isActive: boolean;
  projectName?: string;
  workspaceName?: string;
}

export const RunScript: React.FC<RunScriptProps> = ({ workspaceId, isActive, projectName, workspaceName }) => {
  // Initial tab
  const [tabs, setTabs] = useState([{ id: '1', name: 'Run' }]);
  const [activeTabId, setActiveTabId] = useState('1');
  const { currentProjectPath } = useEditorStore();

  // Lazy initialization state
  const [hasBeenActive, setHasBeenActive] = React.useState(false);

  React.useEffect(() => {
    if (isActive && !hasBeenActive) {
      setHasBeenActive(true);
    }
  }, [isActive, hasBeenActive]);

  const addTab = () => {
    const newId = String(Date.now());
    // Find next available suffix
    let suffix = 1;
    while (tabs.some(t => t.name === `Terminal-${suffix}`)) {
      suffix++;
    }
    const newName = `Terminal-${suffix}`;

    setTabs([...tabs, { id: newId, name: newName }]);
    setActiveTabId(newId);
  };

  const removeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.id !== id);
    if (newTabs.length === 0) return; // Keep at least one
    setTabs(newTabs);
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  // If no workspaceId, we can't really connect, but let's handle gracefully
  if (!workspaceId) return <div className="p-4 text-muted-foreground flex items-center justify-center h-full">No active workspace</div>;

  return (
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

                  {/* Close Button - Overlay on the right with gradient mask */}
                  {tab.id !== '1' && (
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
              className="p-1 hover:bg-muted hover:cursor-pointer rounded-sm text-muted-foreground hover:text-foreground transition-colors ml-1"
              title="New Terminal"
            >
              <Plus className="size-3.5" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">

            <div className="flex items-center h-6 bg-background border border-border rounded-sm shadow-sm overflow-hidden cursor-pointer hover:border-primary/50 transition-colors group/run">
              <button
                className="flex items-center gap-1.5 px-2 h-full hover:bg-muted hover:cursor-pointer transition-colors text-[11px] font-medium text-foreground"
                title="Run configured script"
              >
                <Play className="size-2.5 fill-current group-hover/run:text-primary transition-colors" />
                <span>Run</span>
              </button>
              <div className="w-px h-full bg-border" />
              <span className="flex items-center justify-center px-1.5 text-[9px] text-muted-foreground bg-muted/30 h-full">
                <Command className="size-2 mr-0.5" /> R
              </span>
            </div>

            <button
              className="size-6 flex items-center justify-center hover:bg-muted hover:cursor-pointer rounded-sm text-muted-foreground hover:text-foreground transition-colors"
              title="Configure Scripts"
            >
              <Settings className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative">
          {hasBeenActive && tabs.map(tab => (
            <div
              key={tab.id}
              className={cn("absolute inset-0", activeTabId === tab.id ? "z-10" : "z-0 invisible")}
            >
              <Terminal
                // Using a consistent session ID strategy for "Run Script" tabs
                // This ensures that when the user switches tabs and comes back, or switches workspace and comes back (if component remounts),
                // we attempt to reconnect to the same session if it's still alive.
                sessionId={`run-script-${workspaceId}-${tab.id}`}
                workspaceId={workspaceId}
                projectName={projectName}
                workspaceName={workspaceName}
                noTmux={true}
                cwd={workspaceName ? undefined : (currentProjectPath || undefined)}
              // We treat these as ephemeral in UI but persistent in backend session for this view
              />
            </div>
          ))}
          {!hasBeenActive && null}
        </div>
      </Tabs>
    </div>
  )
}
