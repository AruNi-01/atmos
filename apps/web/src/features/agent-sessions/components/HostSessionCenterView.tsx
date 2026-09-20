"use client";

import { HostSessionDrawer } from "@/features/agent-sessions/components/HostSessionDrawer";
import { HostSessionListView } from "@/features/agent-sessions/components/HostSessionListView";
import { HostSessionListQueryProvider } from "@/features/agent-sessions/hooks/use-host-session-list-query";
import { useHostSessionSelection } from "@/features/agent-sessions/hooks/use-host-session-selection";

export function HostSessionCenterView() {
  const { selectedKey, selectKey } = useHostSessionSelection();

  return (
    <HostSessionListQueryProvider>
      <div className="h-full min-h-0">
        <HostSessionListView />
        <HostSessionDrawer selectedKey={selectedKey} onClose={() => selectKey(null)} />
      </div>
    </HostSessionListQueryProvider>
  );
}
