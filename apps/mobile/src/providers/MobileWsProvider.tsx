import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MobileWsClient, type MobileWsState } from "@/api/mobile-ws-client";
import { useGitStore } from "@/features/git/git-store";
import { useSessionStore } from "@/stores/session-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useUiStore } from "@/stores/ui-store";

type MobileWsContextValue = {
  client: MobileWsClient | null;
  state: MobileWsState;
};

const MobileWsContext = createContext<MobileWsContextValue>({
  client: null,
  state: "idle",
});

export function MobileWsProvider({ children }: PropsWithChildren) {
  const session = useSessionStore((state) => state.activeClientSession);
  const resetGit = useGitStore((state) => state.reset);
  const clearTerminalState = useTerminalStore((state) => state.clearAll);
  const setDisconnectedReason = useUiStore((state) => state.setDisconnectedReason);
  const [wsState, setWsState] = useState<MobileWsState>("idle");
  const previousSessionKeyRef = useRef<string | null | undefined>(undefined);

  const client = useMemo(() => {
    if (!session?.ws_url) return null;
    return new MobileWsClient(session.ws_url);
  }, [session?.ws_url]);

  useEffect(() => {
    const nextSessionKey = session?.ws_url ?? null;
    const previousSessionKey = previousSessionKeyRef.current;
    if (previousSessionKey !== undefined && previousSessionKey !== nextSessionKey) {
      resetGit();
      clearTerminalState();
    }
    previousSessionKeyRef.current = nextSessionKey;
  }, [clearTerminalState, resetGit, session?.ws_url]);

  useEffect(() => {
    if (!client) {
      setWsState("idle");
      setDisconnectedReason(null);
      return undefined;
    }

    const unsubscribe = client.subscribeState((nextState) => {
      setWsState(nextState);
      if (nextState === "closed" || nextState === "error") {
        setDisconnectedReason("Connection to Atmos Computer is unavailable.");
      } else if (nextState === "reconnecting") {
        setDisconnectedReason("Reconnecting to Atmos Computer.");
      } else if (nextState === "open") {
        setDisconnectedReason(null);
      }
    });

    client.connect();
    return () => {
      unsubscribe();
      client.close();
    };
  }, [client, setDisconnectedReason]);

  return <MobileWsContext.Provider value={{ client, state: wsState }}>{children}</MobileWsContext.Provider>;
}

export function useMobileWs() {
  return useContext(MobileWsContext);
}
