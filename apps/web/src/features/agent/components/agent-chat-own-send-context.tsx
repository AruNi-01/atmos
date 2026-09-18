"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { OwnSendKind } from "@/features/agent/lib/agent-chat-own-send";

export type AgentChatOwnSendRefs = {
  liveIdRef: MutableRefObject<string | null>;
  pendingIdRef: MutableRefObject<string | null>;
  anchorIndexRef: MutableRefObject<number | null>;
  invertPxRef: MutableRefObject<number>;
  skipEndAnchorRef: MutableRefObject<boolean>;
  kindRef: MutableRefObject<OwnSendKind | null>;
};

const AgentChatOwnSendRefsContext = createContext<AgentChatOwnSendRefs | null>(null);

export function AgentChatOwnSendRefsProvider({ children }: { children: ReactNode }) {
  const liveIdRef = useRef<string | null>(null);
  const pendingIdRef = useRef<string | null>(null);
  const anchorIndexRef = useRef<number | null>(null);
  const invertPxRef = useRef(0);
  const skipEndAnchorRef = useRef(false);
  const kindRef = useRef<OwnSendKind | null>(null);
  const value = useMemo(
    (): AgentChatOwnSendRefs => ({
      liveIdRef,
      pendingIdRef,
      anchorIndexRef,
      invertPxRef,
      skipEndAnchorRef,
      kindRef,
    }),
    [],
  );
  return (
    <AgentChatOwnSendRefsContext.Provider value={value}>
      {children}
    </AgentChatOwnSendRefsContext.Provider>
  );
}

export function useAgentChatOwnSendRefs(): AgentChatOwnSendRefs | null {
  return useContext(AgentChatOwnSendRefsContext);
}
