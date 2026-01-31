"use client";

import React, { useState, useEffect } from 'react';
import { Play, Settings, Plus, X, Command } from "lucide-react";
import { Terminal } from "@/components/terminal/Terminal";
import { cn } from "@/lib/utils";

interface RunScriptProps {
  workspaceId: string | null;
}

export const RunScript: React.FC<RunScriptProps> = ({ workspaceId }) => {
  // Initial tab
  const [tabs, setTabs] = useState([{ id: '1', name: 'Script' }]);
  const [activeTabId, setActiveTabId] = useState('1');

  const addTab = () => {
    const newId = String(Date.now());
    setTabs([...tabs, { id: newId, name: 'Terminal' }]);
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
      <div className="flex items-center justify-between px-2 h-9 border-b border-border bg-muted/20 shrink-0">
        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 mr-2 no-scrollbar">
          {tabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                "group flex items-center gap-2 px-3 py-1.5 rounded-t-sm text-[11px] font-medium cursor-pointer border-b-[2px] transition-all min-w-[80px] justify-between select-none relative",
                activeTabId === tab.id
                  ? "border-primary text-foreground bg-background shadow-sm"
                  : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <span className="truncate max-w-[80px]">{tab.name}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => removeTab(e, tab.id)}
                  className="opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive rounded p-0.5 transition-all"
                >
                  <X className="size-2.5" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addTab}
            className="p-1 hover:bg-muted rounded-sm text-muted-foreground hover:text-foreground transition-colors"
            title="New Terminal"
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">

          <div className="flex items-center h-6 bg-background border border-border rounded-sm shadow-sm overflow-hidden cursor-pointer hover:border-primary/50 transition-colors group/run">
            <button
              className="flex items-center gap-1.5 px-2 h-full hover:bg-muted transition-colors text-[11px] font-medium text-foreground"
              title="Run configured script"
            >
              <Play className="size-2.5 fill-current group-hover/run:text-primary transition-colors" />
              <span>Run workspace</span>
            </button>
            <div className="w-px h-full bg-border" />
            <span className="flex items-center justify-center px-1.5 text-[9px] text-muted-foreground bg-muted/30 h-full">
              <Command className="size-2 mr-0.5" /> R
            </span>
          </div>

          <button
            className="size-6 flex items-center justify-center hover:bg-muted rounded-sm text-muted-foreground hover:text-foreground transition-colors"
            title="Configure Scripts"
          >
            <Settings className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative bg-[#09090b]">
        {tabs.map(tab => (
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
              noTmux={true}
            // We treat these as ephemeral in UI but persistent in backend session for this view
            />
          </div>
        ))}
      </div>
    </div>
  )
}
