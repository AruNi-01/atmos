"use client";

import React from "react";
import { useQueryState } from "nuqs";
import { Tabs, TabsList, TabsTab } from "@workspace/ui";
import { terminalsParams, type TerminalsView as TerminalsViewMode } from "@/lib/nuqs/searchParams";
import { TerminalManagerView } from "./TerminalManagerView";
import { TerminalCanvasView } from "./TerminalCanvasView";

export const TerminalsView: React.FC = () => {
  const [terminalView, setTerminalView] = useQueryState("terminalView", terminalsParams.terminalView);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Tabs
        value={terminalView}
        onValueChange={(value) => void setTerminalView(value as TerminalsViewMode)}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b border-border bg-background/50 px-6 py-4">
          <TabsList className="h-9 w-fit">
            <TabsTab value="manager" className="px-6 text-sm">
              Manager
            </TabsTab>
            <TabsTab value="canvas" className="px-6 text-sm">
              Canvas
            </TabsTab>
          </TabsList>
        </div>

        <div className="flex-1 overflow-hidden">
          {terminalView === "canvas" ? <TerminalCanvasView /> : <TerminalManagerView />}
        </div>
      </Tabs>
    </div>
  );
};
