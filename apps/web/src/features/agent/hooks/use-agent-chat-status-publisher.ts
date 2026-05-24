"use client";

import { useEffect } from "react";
import { useAgentChatStatusStore } from "@/features/agent/hooks/use-agent-chat-status";

interface UseAgentChatStatusPublisherParams {
  installedAgentCount: number;
  isConnected: boolean;
  publishStatus: boolean;
  waitingForResponse: boolean;
}

export function useAgentChatStatusPublisher({
  installedAgentCount,
  isConnected,
  publishStatus,
  waitingForResponse,
}: UseAgentChatStatusPublisherParams) {
  const setStatusHasAgents = useAgentChatStatusStore((s) => s.setHasInstalledAgents);
  const setStatusConnected = useAgentChatStatusStore((s) => s.setIsConnected);
  const setStatusBusy = useAgentChatStatusStore((s) => s.setIsBusy);

  useEffect(() => {
    if (!publishStatus) return;
    setStatusHasAgents(installedAgentCount > 0);
  }, [installedAgentCount, publishStatus, setStatusHasAgents]);

  useEffect(() => {
    if (!publishStatus) return;
    setStatusConnected(isConnected);
  }, [isConnected, publishStatus, setStatusConnected]);

  useEffect(() => {
    if (!publishStatus) return;
    setStatusBusy(waitingForResponse);
  }, [publishStatus, setStatusBusy, waitingForResponse]);
}
