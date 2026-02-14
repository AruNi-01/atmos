"use client";

import React from "react";
import Image from "next/image";
import { Bot } from "lucide-react";

const AGENT_ICON_ALIASES: Record<string, string[]> = {
  "claude-code-acp": ["claude-code"],
  "codex-acp": ["codex"],
  "github-copilot": ["copilot"],
  "factory-droid": ["droid"],
  "junie-acp": ["junie"],
};

export function getAgentIconCandidates(registryId: string): string[] {
  const aliases = AGENT_ICON_ALIASES[registryId] ?? [];
  return [registryId, ...aliases].map((name) => `/agents/${name}.svg`);
}

export const AgentIcon: React.FC<{
  registryId: string;
  name: string;
  size?: number;
}> = ({ registryId, name, size = 18 }) => {
  const candidates = React.useMemo(
    () => getAgentIconCandidates(registryId),
    [registryId]
  );
  const [idx, setIdx] = React.useState(0);

  if (idx >= candidates.length) {
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
      className="shrink-0 opacity-95 invert dark:invert-0"
      onError={() => setIdx((v) => v + 1)}
    />
  );
};
