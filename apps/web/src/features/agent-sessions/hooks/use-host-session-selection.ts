"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAppRouter } from "@/shared/hooks/use-app-router";
import { hostSessionHref } from "@/features/agent-sessions/lib/host-session-filters";

export function useHostSessionSelection(): {
  selectedKey: string | null;
  messageId: string | null;
  seq: number | null;
  selectKey: (
    key: string | null,
    locator?: { messageId?: string | null; seq?: number | null },
  ) => void;
} {
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const selectedKey = searchParams.get("key");
  const messageId = searchParams.get("mid");
  const seqRaw = searchParams.get("seq");
  const seq =
    seqRaw != null && seqRaw !== "" && Number.isInteger(Number(seqRaw)) ? Number(seqRaw) : null;

  const selectKey = useCallback(
    (key: string | null, locator?: { messageId?: string | null; seq?: number | null }) => {
      router.replace(hostSessionHref(key, locator));
    },
    [router],
  );

  return { selectedKey, messageId, seq, selectKey };
}
