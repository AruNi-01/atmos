"use client";

import React from "react";
import Image from "next/image";
import { Bot } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@workspace/ui";
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
  /**
   * Optional monochrome tint. Local icons are drawn as a CSS mask so brand
   * glyphs pick up this color (used by token-usage legends / chart keys).
   */
  color?: string;
  className?: string;
}> = ({
  registryId,
  name,
  size = 18,
  isCustom = false,
  registryIcon = null,
  color,
  className,
}) => {
  const { resolvedTheme } = useTheme();
  const isLikelyCustom = React.useMemo(
    () => isCustom || registryId.includes(" ") || registryId.includes("%20"),
    [isCustom, registryId]
  );

  const sources = React.useMemo(() => {
    const normalizedRegistryIcon = registryIcon?.trim() || null;
    if (isLikelyCustom) {
      return normalizedRegistryIcon ? [normalizedRegistryIcon] : [];
    }

    // Resolve remaps/aliases first so tokscale ids (roocode, grok, …) hit real assets.
    const localCandidates = getAgentIconCandidates(registryId);
    const themePairKey = Object.keys(AGENT_THEME_PAIR_ICONS).find(
      (key) =>
        key === registryId ||
        localCandidates.some((path) => path.includes(`/agents/${key}`)),
    );
    const themePair = themePairKey ? AGENT_THEME_PAIR_ICONS[themePairKey] : undefined;

    let out: string[];
    if (themePair) {
      const preferred = resolvedTheme === "dark" ? themePair.dark : themePair.light;
      const fallback = preferred === themePair.dark ? themePair.light : themePair.dark;
      out = [preferred, fallback];
    } else {
      out = [...localCandidates];
    }
    if (normalizedRegistryIcon && !out.includes(normalizedRegistryIcon)) {
      out.push(normalizedRegistryIcon);
    }
    return out;
  }, [registryId, isLikelyCustom, registryIcon, resolvedTheme]);
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
        className={cn("shrink-0", color ? undefined : "text-muted-foreground", className)}
        style={{ width: size, height: size, color: color || undefined }}
      />
    );
  }

  const currentSrc = sources[idx]!;
  const isLocalSrc = currentSrc.startsWith("/");

  // Tint monochrome local glyphs so chart legends match segment colors.
  // Skip multi-color / photographic assets (native theme) — mask would wash them out.
  if (color && isLocalSrc && !nativeTheme) {
    return (
      <span
        role="img"
        aria-label={`${name} icon`}
        className={cn("inline-block shrink-0", className)}
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          WebkitMaskImage: `url(${currentSrc})`,
          WebkitMaskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskImage: `url(${currentSrc})`,
          maskSize: "contain",
          maskRepeat: "no-repeat",
          maskPosition: "center",
        }}
      />
    );
  }

  if (isLocalSrc) {
    return (
      <Image
        src={currentSrc}
        alt={`${name} icon`}
        width={size}
        height={size}
        className={cn(localIconClassName, className)}
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
      className={cn("shrink-0 opacity-95 invert-0 dark:invert", className)}
      onError={advanceSource}
    />
  );
};
