"use client";

import * as React from "react";

import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import type { GithubRelayPrerequisites } from "@/features/automations/lib/github-trigger-relay";

export function useGithubRelayPrerequisites(): GithubRelayPrerequisites {
  const connectionMode = useAtmosComputerStore((state) => state.connectionMode);
  const controlPlaneUrl = useAtmosComputerStore((state) => state.controlPlaneUrl);
  const accessToken = useAtmosComputerStore((state) => state.accessToken);
  const localServerId = useAtmosComputerStore((state) => state.localServerId);
  const selectedServerId = useAtmosComputerStore((state) => state.selectedServerId);

  return React.useMemo(() => {
    const activeServerId = connectionMode === "relay" ? selectedServerId : localServerId;
    return {
      controlPlaneUrl,
      accessToken: accessToken.trim(),
      serverId: activeServerId?.trim() || null,
    };
  }, [accessToken, connectionMode, controlPlaneUrl, localServerId, selectedServerId]);
}
