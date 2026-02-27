"use client";

import React from 'react';
import {
  Tabs,
  TabsList,
  TabsTab,
  TabsPanel,
  Folder,
} from "@workspace/ui";
import { useQueryState } from "nuqs";
import { RecentWorkspacesView } from './RecentWorkspacesView';
import { ArchivedWorkspacesView } from './ArchivedWorkspacesView';
import { workspacesParams } from "@/lib/nuqs/searchParams";

export const WorkspacesManagementView: React.FC = () => {
  const [view, setView] = useQueryState("view", workspacesParams.view);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <Tabs 
        value={view} 
        onValueChange={(v) => setView(v as "recent" | "archived")}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 shrink-0 border-b border-border bg-background/50">
          <TabsList className="w-fit h-9">
            <TabsTab value="recent" className="flex items-center gap-2 px-6 text-sm">
              Recently
            </TabsTab>
            <TabsTab value="archived" className="flex items-center gap-2 px-6 text-sm">
              Archived
            </TabsTab>
          </TabsList>
        </div>

        <TabsPanel value="recent" className="flex-1 overflow-hidden m-0">
          <RecentWorkspacesView />
        </TabsPanel>

        <TabsPanel value="archived" className="flex-1 overflow-hidden m-0">
          <ArchivedWorkspacesView />
        </TabsPanel>
      </Tabs>
    </div>
  );
};
