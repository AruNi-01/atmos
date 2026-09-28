import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CodeAgentCustomEntry } from "@atmos/api-types/ws/dto/settings";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { useSessionStore } from "@/stores/session-store";
import {
  mergeTerminalLaunchAgents,
  terminalLaunchAgentCacheKey,
  type MobileLaunchAgent,
} from "./terminal-launch-agents";

/** Cached agent list for this Computer, then a background refresh. */
export function useTerminalLaunchAgents(active: boolean): MobileLaunchAgent[] {
  const { client, state } = useMobileWs();
  const selectedServerId = useSessionStore((store) => store.selectedServerId);
  const [custom, setCustom] = useState<CodeAgentCustomEntry[] | null>(null);

  useEffect(() => {
    const key = terminalLaunchAgentCacheKey(selectedServerId);
    let cancelled = false;
    let fetched = false;
    setCustom(null);
    if (key) {
      void AsyncStorage.getItem(key).then((raw) => {
        if (cancelled || fetched || !raw) return;
        const parsed = parseCachedAgents(raw);
        if (parsed) setCustom(parsed);
      }).catch(() => undefined);
    }
    if (!active || !client || state !== "open" || !key) {
      return () => {
        cancelled = true;
      };
    }
    void wsActions.codeAgentCustomGet(client).then((payload) => {
      if (cancelled) return;
      fetched = true;
      const agents = Array.isArray(payload.agents) ? payload.agents : [];
      setCustom(agents);
      void AsyncStorage.setItem(key, JSON.stringify(agents)).catch(() => undefined);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, client, selectedServerId, state]);

  return useMemo(() => mergeTerminalLaunchAgents(custom), [custom]);
}

function parseCachedAgents(raw: string): CodeAgentCustomEntry[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((agent): agent is CodeAgentCustomEntry => {
      if (!agent || typeof agent !== "object") return false;
      const row = agent as Partial<CodeAgentCustomEntry>;
      return typeof row.id === "string" && typeof row.cmd === "string" && typeof row.flags === "string" && typeof row.label === "string";
    });
  } catch {
    return null;
  }
}
