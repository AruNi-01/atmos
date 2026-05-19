"use client";

import * as React from "react";

export type CanvasAgentCrashRecovery = {
  /** Bump to remount the tldraw subtree. */
  bumpRemount: () => void;
  /** Fail the in-flight agent request (if any) and notify CLI. */
  failInflight: (message: string) => Promise<void>;
  /** Reload board snapshot from API, then remount tldraw. */
  reloadBoard: () => Promise<void>;
};

const CanvasAgentCrashContext = React.createContext<CanvasAgentCrashRecovery | null>(null);

export function CanvasAgentCrashProvider({
  value,
  children,
}: {
  value: CanvasAgentCrashRecovery;
  children: React.ReactNode;
}) {
  return (
    <CanvasAgentCrashContext.Provider value={value}>
      {children}
    </CanvasAgentCrashContext.Provider>
  );
}

export function useCanvasAgentCrashRecovery(): CanvasAgentCrashRecovery | null {
  return React.useContext(CanvasAgentCrashContext);
}
