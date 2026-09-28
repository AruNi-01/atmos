"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { functionSettingsApi } from "@/api/ws/settings-api";

function parsePinnedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) ids.push(item);
  }
  return ids;
}

export function usePinnedSessionIds() {
  const scope = useComputerQueryScope();
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const idsRef = useRef(pinnedIds);
  const touched = useRef(false);
  idsRef.current = pinnedIds;

  useEffect(() => {
    let cancelled = false;
    touched.current = false;
    void functionSettingsApi
      .get()
      .then((settings) => {
        if (cancelled || touched.current) return;
        setPinnedIds(parsePinnedIds(settings.workspace_sidebar?.pinned_session_ids));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const togglePin = useCallback((sessionId: string) => {
    touched.current = true;
    const current = idsRef.current;
    const next = current.includes(sessionId)
      ? current.filter((id) => id !== sessionId)
      : [sessionId, ...current];
    idsRef.current = next;
    setPinnedIds(next);
    void functionSettingsApi.update("workspace_sidebar", "pinned_session_ids", next).catch(() => {
      if (idsRef.current !== next) return;
      idsRef.current = current;
      setPinnedIds(current);
    });
  }, []);

  return { pinnedIds, togglePin };
}
