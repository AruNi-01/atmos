"use client";

import React from "react";
import Image from "next/image";
import { Bot } from "lucide-react";

const AGENT_ICON_ALIASES: Record<string, string[]> = {
  "claude-code-acp": ["claude-code"],
  "claude-acp": ["claude-code-acp", "claude-code"],
  "codex-acp": ["codex"],
  "github-copilot": ["copilot"],
  "factory-droid": ["droid"],
  "junie-acp": ["junie"],
  "claude": ["claude-code"],
  "kilocode": ["kilo"],
  "kiro": ["kiro-cli"],
  "agent": ["cursor"],
};

/** Icons that use currentColor — need inverted theme handling (dark on light, light on dark) */
const INVERTED_THEME_ICONS = new Set(["cline", "junie", "junie-acp"]);

export function getAgentIconCandidates(registryId: string): string[] {
  const aliases = AGENT_ICON_ALIASES[registryId] ?? [];
  return [registryId, ...aliases].map((name) => `/agents/${name}.svg`);
}

function shouldInvertTheme(registryId: string): boolean {
  if (INVERTED_THEME_ICONS.has(registryId)) return true;
  const aliases = AGENT_ICON_ALIASES[registryId] ?? [];
  return [registryId, ...aliases].some((name) => INVERTED_THEME_ICONS.has(name));
}

export const AgentIcon: React.FC<{
  registryId: string;
  name: string;
  size?: number;
  isCustom?: boolean;
}> = ({ registryId, name, size = 18, isCustom = false }) => {
  const isLikelyCustom = React.useMemo(
    () => isCustom || registryId.includes(" ") || registryId.includes("%20"),
    [isCustom, registryId]
  );

  const candidates = React.useMemo(
    () => (isLikelyCustom ? [] : getAgentIconCandidates(registryId)),
    [registryId, isLikelyCustom]
  );
  const [idx, setIdx] = React.useState(0);
  const invertedTheme = shouldInvertTheme(registryId);

  if (isLikelyCustom || idx >= candidates.length) {
    return (
      <Bot
        className="text-muted-foreground shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <Image
      src={candidates[idx]}
      alt={`${name} icon`}
      width={size}
      height={size}
      className={`shrink-0 opacity-95 ${invertedTheme ? "dark:invert invert-0" : "invert dark:invert-0"}`}
      onError={() => setIdx((v) => v + 1)}
    />
  );
};
