"use client";

import { useQueryState } from "nuqs";
import { agentChatParams } from "@/lib/nuqs/searchParams";

/**
 * Hook to manage Agent Chat open/close state via URL param `?chat=true`.
 * Returns [isOpen, setIsOpen] — same API as useState<boolean>.
 */
export function useAgentChatUrl() {
  return useQueryState("chat", agentChatParams.chat);
}
