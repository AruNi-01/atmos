"use client";

import React from "react";
import Image from "next/image";
import { Bot } from "lucide-react";
import { useTheme } from "next-themes";
import {
  AGENT_THEME_PAIR_ICONS,
  getAgentIconCandidates,
  shouldInvertAgentIconTheme,
  shouldUseNativeAgentIconTheme,
} from "@/features/agent/lib/agent-icon-candidates";

export { getAgentIconCandidates } from "@/features/agent/lib/agent-icon-candidates";

export const AgentIcon: React.FC<{
  registryId: string;
  name: string;
  size?: number;
  isCustom?: boolean;
  registryIcon?: string | null;
}> = ({ registryId, name, size = 18, isCustom = false, registryIcon = null }) => {
  const { resolvedTheme } = useTheme();
  const isLikelyCustom = React.useMemo(
    () => isCustom || registryId.includes(" ") || registryId.includes("%20"),
    [isCustom, registryId]
  );

  const sources = React.useMemo(
    () => {
      const themePair = !isLikelyCustom ? AGENT_THEME_PAIR_ICONS[registryId] : undefined;
      if (themePair) {
        const preferred = resolvedTheme === "dark" ? themePair.dark : themePair.light;
        const fallback = preferred === themePair.dark ? themePair.light : themePair.dark;
        const out = [preferred, fallback];
        const normalizedRegistryIcon = registryIcon?.trim() || null;
        if (normalizedRegistryIcon && !out.includes(normalizedRegistryIcon)) {
          out.push(normalizedRegistryIcon);
        }
        return out;
      }

      const localCandidates = isLikelyCustom ? [] : getAgentIconCandidates(registryId);
      const normalizedRegistryIcon = registryIcon?.trim() || null;
      const out = [...localCandidates];
      if (normalizedRegistryIcon && !out.includes(normalizedRegistryIcon)) {
        out.push(normalizedRegistryIcon);
      }
      return out;
    },
    [registryId, isLikelyCustom, registryIcon, resolvedTheme]
  );
  const sourceKey = sources.join("\0");
  const [sourceState, setSourceState] = React.useState({ key: sourceKey, idx: 0 });
  const idx = sourceState.key === sourceKey ? sourceState.idx : 0;
  const advanceSource = () => {
    setSourceState((previous) => ({
      key: sourceKey,
      idx: previous.key === sourceKey ? previous.idx + 1 : 1,
    }));
  };
  const invertedTheme = shouldInvertAgentIconTheme(registryId);
  const nativeTheme = shouldUseNativeAgentIconTheme(registryId);
  const localIconClassName = nativeTheme
    ? "shrink-0 opacity-95 invert-0"
    : `shrink-0 opacity-95 ${invertedTheme ? "dark:invert invert-0" : "invert dark:invert-0"}`;

  if (idx >= sources.length) {
    return (
      <Bot
        className="text-muted-foreground shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  const currentSrc = sources[idx]!;
  const isLocalSrc = currentSrc.startsWith("/");

  if (isLocalSrc) {
    return (
      <Image
        src={currentSrc}
        alt={`${name} icon`}
        width={size}
        height={size}
        className={localIconClassName}
        onError={advanceSource}
      />
    );
  }

  return (
    <img
      src={currentSrc}
      alt={`${name} icon`}
      width={size}
      height={size}
      className="shrink-0 opacity-95 invert-0 dark:invert"
      onError={advanceSource}
    />
  );
};
