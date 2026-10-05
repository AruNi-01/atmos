"use client";

import { useMemo, useRef } from "react";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { HostSessionTranscript } from "@/features/agent-sessions/components/HostSessionTranscript";
import { SubagentOverlayProvider } from "@/features/agent/components/subagent-overlay-context";

export function ObserverSessionTranscript({
  messages,
  cwd,
  registryId,
  subagentCardMode,
  onOpenChild,
}: {
  messages: AgentMessage[];
  cwd: string;
  registryId: string;
  subagentCardMode: "live" | "transcript";
  onOpenChild?: (childId: string) => void;
}) {
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const scrollToIndexRef = useRef<((index: number) => void) | null>(null);
  const userMessageIndices = useMemo(
    () => messages
      .map((message, index) => (message.role === "user" ? index : -1))
      .filter((index) => index >= 0),
    [messages],
  );

  return (
    <SubagentOverlayProvider
      selectedId={null}
      onSelect={(id) => {
        if (id) onOpenChild?.(id);
      }}
    >
      <HostSessionTranscript
        messages={messages}
        cwd={cwd}
        registryId={registryId}
        transcriptRef={transcriptRef}
        overlayPadPx={0}
        overlayPadShrinking={false}
        reduceOverlayPadMotion
        subagentCardMode={subagentCardMode}
        userMessageIndices={userMessageIndices}
        onActiveUserMessage={() => {}}
        scrollToIndexRef={scrollToIndexRef}
      />
    </SubagentOverlayProvider>
  );
}
