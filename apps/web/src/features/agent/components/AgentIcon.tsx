"use client";

import React from "react";
import Image from "next/image";
import { Bot } from "lucide-react";
import { useTheme } from "next-themes";

const AGENT_ICON_ALIASES: Record<string, string[]> = {
  "claude-code-acp": ["claude-code"],
  "claude-acp": ["claude-code-acp", "claude-code"],
  "codex-acp": ["codex"],
  "github-copilot": ["copilot"],
  "factory-droid": ["droid"],
  "junie-acp": ["junie"],
  // NOTE: do NOT alias bare "agent" → cursor (APP-036 contested freehand identity).
  "commandcode": ["command-code"],
};

// Map registry IDs that don't have a matching SVG file to the actual filename.
// Unlike aliases (which append fallback candidates after the registryId),
// this replaces the primary candidate to avoid a guaranteed 404.
const AGENT_ICON_REMAP: Record<string, string> = {
  "amp-acp": "amp",
  "claude": "claude-code",
  "hermes": "hermes-agent.png",
  "openclaw": "openclaw.jpg",
  "kilocode": "kilo",
  "kiro": "kiro-cli",
  "commandcode": "command-code",
};

/** Theme-pair brand icons (pre-filled light/dark assets — do not invert). */
const THEME_PAIR_ICONS: Record<string, { light: string; dark: string }> = {
  "grok-build": {
    light: "/agents/grok-build-light.svg",
    dark: "/agents/grok-build-dark.svg",
  },
};

/** Icons that use currentColor — need inverted theme handling (dark on light, light on dark) */
const INVERTED_THEME_ICONS = new Set(["cline", "junie", "junie-acp", "devin"]);
const THEME_NATIVE_ICONS = new Set([
  "hermes",
  "hermes-agent.png",
  "openclaw",
  "openclaw.jpg",
  "pi",
  "grok-build",
  "grok-build-light",
  "grok-build-dark",
]);

export function getAgentIconCandidates(registryId: string): string[] {
  const themePair = THEME_PAIR_ICONS[registryId];
  if (themePair) {
    // Prefer light as default path list; component picks by theme at render time.
    return [themePair.light, themePair.dark];
  }
  const primary = AGENT_ICON_REMAP[registryId] ?? registryId;
  const aliases = AGENT_ICON_ALIASES[registryId] ?? [];
  // Deduplicate: primary first, then any aliases that differ
  const seen = new Set<string>();
  const names: string[] = [];
  for (const n of [primary, ...aliases]) {
    if (!seen.has(n)) { seen.add(n); names.push(n); }
  }
  return names.map((name) => `/agents/${name.includes(".") ? name : `${name}.svg`}`);
}

function shouldInvertTheme(registryId: string): boolean {
  if (THEME_PAIR_ICONS[registryId]) return false;
  if (INVERTED_THEME_ICONS.has(registryId)) return true;
  const remapped = AGENT_ICON_REMAP[registryId];
  if (remapped && INVERTED_THEME_ICONS.has(remapped)) return true;
  const aliases = AGENT_ICON_ALIASES[registryId] ?? [];
  return aliases.some((name) => INVERTED_THEME_ICONS.has(name));
}

function shouldUseNativeTheme(registryId: string): boolean {
  if (THEME_PAIR_ICONS[registryId]) return true;
  if (THEME_NATIVE_ICONS.has(registryId)) return true;
  const remapped = AGENT_ICON_REMAP[registryId];
  if (remapped && THEME_NATIVE_ICONS.has(remapped)) return true;
  const aliases = AGENT_ICON_ALIASES[registryId] ?? [];
  return aliases.some((name) => THEME_NATIVE_ICONS.has(name));
}

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
      const themePair = !isLikelyCustom ? THEME_PAIR_ICONS[registryId] : undefined;
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
  const invertedTheme = shouldInvertTheme(registryId);
  const nativeTheme = shouldUseNativeTheme(registryId);
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
