import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CodeAgentCustomEntry } from "@atmos/api-types/ws/dto/settings";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { mergeTerminalLaunchAgents, type MobileLaunchAgent } from "./terminal-launch-agents";

const CACHE_KEY = "atmos.mobile.code-agent-custom";

/** Cached agent list first, then a background refresh from the Computer. */
export function useTerminalLaunchAgents(active: boolean): MobileLaunchAgent[] {
  const { client, state } = useMobileWs();
  const [custom, setCustom] = useState<CodeAgentCustomEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(CACHE_KEY).then((raw) => {
      if (cancelled || !raw) return;
      const parsed = parseCachedAgents(raw);
      if (parsed) setCustom(parsed);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active || !client || state !== "open") return undefined;
    let cancelled = false;
    void wsActions.codeAgentCustomGet(client).then((payload) => {
      if (cancelled) return;
      const agents = Array.isArray(payload.agents) ? payload.agents : [];
      setCustom(agents);
      void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(agents)).catch(() => undefined);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [active, client, state]);

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
