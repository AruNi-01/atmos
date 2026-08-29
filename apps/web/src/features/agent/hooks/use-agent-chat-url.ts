"use client";

import { useQueryState } from "nuqs";
import { agentChatParams } from "@/shared/lib/nuqs/searchParams";

/**
 * Footer / command-palette Agent Chat modal. Open state is `?chat=true`.
 * Returns `[isOpen, setIsOpen]` — same API as `useState<boolean>`.
 */
export function useAgentChatUrl() {
  return useQueryState("chat", agentChatParams.chat);
}
