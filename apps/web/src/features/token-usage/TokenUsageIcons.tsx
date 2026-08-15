"use client";

import { Bot, BrainCircuit, Cpu } from "lucide-react";
import { cn } from "@workspace/ui";

import { AgentIcon } from "@/features/agent/components/AgentIcon";
import { resolveTokenUsageModelIconSrc } from "@/features/token-usage/token-usage-dialog-utils";

const TOKEN_USAGE_AGENT_ICON_ID: Record<string, string> = {
  claude: "claude-code",
  roocode: "roo",
  kilocode: "kilo",
  kilo: "kilo",
  kiro: "kiro-cli",
  commandcode: "command-code",
  qwen: "qwen-code",
  codebuddy: "codebuddy-code",
  workbuddy: "codebuddy-code",
  "devin-cli": "devin",
  "devin-desktop": "devin",
  "antigravity-cli": "antigravity",
  augment: "auggie",
  grok: "grok-build",
  copilot: "copilot",
  "factory-droid": "droid",
  "github-copilot": "copilot",
};

/** Normalize token-usage client ids toward AgentIcon registry ids. */
function normalizeAgentRegistryId(clientId: string): string {
  const normalized = clientId.trim().toLowerCase().replace(/_/g, "-");
  return TOKEN_USAGE_AGENT_ICON_ID[normalized] ?? normalized;
}

export function TokenUsageAgentIcon({
  clientId,
  name,
  size = 12,
  color,
}: {
  clientId: string;
  name: string;
  size?: number;
  /** Optional monochrome tint (chart legend / segment key). */
  color?: string;
}) {
  if (clientId === "other") {
    return (
      <Bot
        className={cn("shrink-0", color ? undefined : "text-muted-foreground")}
        style={{ width: size, height: size, color: color || undefined }}
        aria-hidden
      />
    );
  }
  return (
    <AgentIcon
      registryId={normalizeAgentRegistryId(clientId)}
      name={name}
      size={size}
      color={color}
    />
  );
}

/**
 * Model / provider brand icon for model-dimension rows.
 * Uses tokscale `provider_id` (with model-name inference fallback) mapped onto
 * `/ai-provider/*` or `/agents/*` assets. Falls back to Cpu when unknown.
 */
export function TokenUsageModelIcon({
  modelId,
  providerId,
  name,
  size = 12,
  color,
}: {
  modelId: string;
  providerId?: string | null;
  name: string;
  size?: number;
  /** Optional monochrome tint (chart legend / segment key). */
  color?: string;
}) {
  if (modelId === "other") {
    return (
      <BrainCircuit
        className={cn("shrink-0", color ? undefined : "text-muted-foreground")}
        style={{ width: size, height: size, color: color || undefined }}
        aria-hidden
      />
    );
  }

  const iconSrc = resolveTokenUsageModelIconSrc(providerId, modelId);
  if (!iconSrc) {
    return (
      <Cpu
        className={cn("shrink-0", color ? undefined : "text-muted-foreground")}
        style={{ width: size, height: size, color: color || undefined }}
        aria-hidden
      />
    );
  }

  // Tint monochrome glyphs so legends match segment colors (same approach as AgentIcon).
  if (color) {
    return (
      <span
        role="img"
        aria-label={`${name} icon`}
        className="inline-block shrink-0"
        style={{
          width: size,
          height: size,
          backgroundColor: color,
          WebkitMaskImage: `url(${iconSrc})`,
          WebkitMaskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskImage: `url(${iconSrc})`,
          maskSize: "contain",
          maskRepeat: "no-repeat",
          maskPosition: "center",
        }}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={`${name} icon`}
      className="inline-block shrink-0 bg-current text-foreground"
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url(${iconSrc})`,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskImage: `url(${iconSrc})`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
      }}
    />
  );
}
