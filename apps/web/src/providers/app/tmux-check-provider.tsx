"use client";

import React, { useState, useEffect } from "react";
import { useTmuxCheck } from "@/shared/hooks/use-tmux-check";
import { TmuxInstallDialog } from "@/features/terminal/components/TmuxInstallDialog";
import { useHostedConnectionStore } from "@/features/connection/hooks/use-hosted-connection-store";
import { isHostedAtmosOrigin } from "@/shared/lib/desktop-runtime";

interface TmuxCheckProviderProps {
  children: React.ReactNode;
}

/**
 * Global tmux check: when tmux is not installed, show install guide modal.
 * User can dismiss via "Continue Without tmux" (won't show again until refresh).
 */
export function TmuxCheckProvider({ children }: TmuxCheckProviderProps) {
  const hostedBootstrapState = useHostedConnectionStore((s) => s.bootstrapState);
  const shouldCheckTmux = !isHostedAtmosOrigin() || hostedBootstrapState === "connected";
  const { isLoading, isInstalled, refetch } = useTmuxCheck({ enabled: shouldCheckTmux });
  const [userDismissed, setUserDismissed] = useState(false);

  const showDialog =
    shouldCheckTmux && !isLoading && isInstalled === false && !userDismissed;

  // Reset dismissed state when tmux becomes installed (e.g. user installed and retried)
  useEffect(() => {
    if (isInstalled === true) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserDismissed(false);
    }
  }, [isInstalled]);

  return (
    <>
      {children}
      <TmuxInstallDialog
        isOpen={showDialog}
        onClose={() => setUserDismissed(true)}
        onRetry={() => refetch()}
        onInstalled={() => refetch()}
      />
    </>
  );
}
