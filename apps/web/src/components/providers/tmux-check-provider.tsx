"use client";

import React, { useState, useEffect } from "react";
import { useTmuxCheck } from "@/hooks/use-tmux-check";
import { TmuxInstallDialog } from "@/components/dialogs/TmuxInstallDialog";

interface TmuxCheckProviderProps {
  children: React.ReactNode;
}

/**
 * Global tmux check: when tmux is not installed, show install guide modal.
 * User can dismiss via "Continue Without tmux" (won't show again until refresh).
 */
export function TmuxCheckProvider({ children }: TmuxCheckProviderProps) {
  const { isLoading, isInstalled, refetch } = useTmuxCheck();
  const [userDismissed, setUserDismissed] = useState(false);

  const showDialog = !isLoading && !isInstalled && !userDismissed;

  // Reset dismissed state when tmux becomes installed (e.g. user installed and retried)
  useEffect(() => {
    if (isInstalled) {
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
      />
    </>
  );
}
