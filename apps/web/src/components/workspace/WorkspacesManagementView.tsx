"use client";

import React from 'react';
import {
  Tabs,
  TabsList,
  TabsTab,
  TabsPanel,
  Folder,
} from "@workspace/ui";
import { RecentWorkspacesView } from './RecentWorkspacesView';
import { ArchivedWorkspacesView } from './ArchivedWorkspacesView';
import { useSearchParams, useRouter } from 'next/navigation';

export const WorkspacesManagementView: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const view = searchParams.get('view');
  
  // Determine active tab based on 'view' param, default to 'recent'
  const activeTab = view === 'archived' ? 'archived' : 'recent';

  const handleTabChange = (value: string) => {
    // Keep all other search params, but update 'view'
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', value);
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <Tabs 
        value={activeTab} 
        onValueChange={handleTabChange}
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
          <RecentWorkspacesView refreshKey={searchParams.toString()} />
        </TabsPanel>

        <TabsPanel value="archived" className="flex-1 overflow-hidden m-0">
          <ArchivedWorkspacesView />
        </TabsPanel>
      </Tabs>
    </div>
  );
};
