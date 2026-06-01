"use client";

import React from 'react';
import {
  Tabs,
  TabsList,
  TabsTab,
  TabsPanel,
} from "@workspace/ui";
import { useQueryState } from "nuqs";
import { RecentWorkspacesView } from './RecentWorkspacesView';
import { ArchivedWorkspacesView } from './ArchivedWorkspacesView';
import { workspacesParams } from "@/shared/lib/nuqs/searchParams";

export const WorkspacesManagementView: React.FC = () => {
  const [view, setView] = useQueryState("view", workspacesParams.view);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <Tabs 
        value={view} 
        onValueChange={(v) => setView(v as "recent" | "archived")}
        className="relative flex-1 flex flex-col overflow-hidden"
      >
        <div className="pointer-events-none absolute left-1/2 top-12 z-30 w-full max-w-5xl -translate-x-1/2 px-8">
          <div className="flex justify-end">
            <div className="pointer-events-auto">
              <WorkspaceViewTabs />
            </div>
          </div>
        </div>
        <TabsPanel keepMounted value="recent" className="flex-1 overflow-hidden m-0">
          <RecentWorkspacesView viewSwitcher={<WorkspaceViewTabsSpacer />} />
        </TabsPanel>

        <TabsPanel keepMounted value="archived" className="flex-1 overflow-hidden m-0">
          <ArchivedWorkspacesView viewSwitcher={<WorkspaceViewTabsSpacer />} />
        </TabsPanel>
      </Tabs>
    </div>
  );
};

function WorkspaceViewTabs() {
  return (
    <TabsList className="h-9">
      <TabsTab value="recent" className="flex items-center gap-2 px-6 text-sm">
        Recently
      </TabsTab>
      <TabsTab value="archived" className="flex items-center gap-2 px-6 text-sm">
        Archived
      </TabsTab>
    </TabsList>
  );
}

function WorkspaceViewTabsSpacer() {
  return <div aria-hidden="true" className="h-9 w-[222px]" />;
}
