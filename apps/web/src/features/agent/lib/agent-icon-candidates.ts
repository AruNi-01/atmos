/**
 * Agent icon path resolution shared by React `AgentIcon` and non-React
 * notification icon selection (avoids importing a client component module).
 */

const AGENT_ICON_ALIASES: Record<string, string[]> = {
  "claude-code-acp": ["claude-code"],
  "claude-acp": ["claude-code-acp", "claude-code"],
  "codex-acp": ["codex"],
  "github-copilot": ["copilot"],
  "factory-droid": ["droid"],
  "junie-acp": ["junie"],
  // NOTE: do NOT alias bare "agent" → cursor (APP-036 contested freehand identity).
  "commandcode": ["command-code"],
  // tokscale client ids → local brand assets
  "roocode": ["roo"],
  "devin-cli": ["devin"],
  "devin-desktop": ["devin"],
  "antigravity-cli": ["antigravity"],
  "augment": ["auggie"],
  "codebuddy": ["codebuddy-code"],
  "workbuddy": ["codebuddy-code"],
  "copilot": ["github-copilot", "copilot"],
  "grok": ["grok-build"],
  "qwen": ["qwen-code"],
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
  "kilo": "kilo",
  "kiro": "kiro-cli",
  "commandcode": "command-code",
  "roocode": "roo",
  "roo": "roo",
  "qwen": "qwen-code",
  "codebuddy": "codebuddy-code",
  "workbuddy": "codebuddy-code",
  "devin-cli": "devin",
  "devin-desktop": "devin",
  "antigravity-cli": "antigravity",
  "augment": "auggie",
  "grok": "grok-build",
  "copilot": "copilot",
};

/** Theme-pair brand icons (pre-filled light/dark assets — do not invert). */
export const AGENT_THEME_PAIR_ICONS: Record<string, { light: string; dark: string }> = {
  "grok-build": {
    light: "/agents/grok-build-light.svg",
    dark: "/agents/grok-build-dark.svg",
  },
};

/** Icons that use currentColor — need inverted theme handling (dark on light, light on dark) */
export const AGENT_INVERTED_THEME_ICONS = new Set(["cline", "junie", "junie-acp", "devin"]);
export const AGENT_THEME_NATIVE_ICONS = new Set([
  "hermes",
  "hermes-agent.png",
  "openclaw",
  "openclaw.jpg",
  "pi",
  "grok",
  "grok-build",
  "grok-build-light",
  "grok-build-dark",
  "antigravity",
  "antigravity-cli",
]);

export function getAgentIconCandidates(registryId: string): string[] {
  const remapped = AGENT_ICON_REMAP[registryId] ?? registryId;
  const themePair =
    AGENT_THEME_PAIR_ICONS[registryId] ?? AGENT_THEME_PAIR_ICONS[remapped];
  if (themePair) {
    // Prefer light as default path list; component picks by theme at render time.
    return [themePair.light, themePair.dark];
  }
  const primary = remapped;
  const aliases = [
    ...(AGENT_ICON_ALIASES[registryId] ?? []),
    ...(AGENT_ICON_ALIASES[remapped] ?? []),
  ];
  // Deduplicate: primary first, then any aliases that differ
  const seen = new Set<string>();
  const names: string[] = [];
  for (const n of [primary, ...aliases]) {
    if (!seen.has(n)) {
      seen.add(n);
      names.push(n);
    }
  }
  return names.map((name) => `/agents/${name.includes(".") ? name : `${name}.svg`}`);
}

export function shouldInvertAgentIconTheme(registryId: string): boolean {
  if (AGENT_THEME_PAIR_ICONS[registryId]) return false;
  if (AGENT_INVERTED_THEME_ICONS.has(registryId)) return true;
  const remapped = AGENT_ICON_REMAP[registryId];
  if (remapped && AGENT_INVERTED_THEME_ICONS.has(remapped)) return true;
  const aliases = AGENT_ICON_ALIASES[registryId] ?? [];
  return aliases.some((name) => AGENT_INVERTED_THEME_ICONS.has(name));
}

export function shouldUseNativeAgentIconTheme(registryId: string): boolean {
  if (AGENT_THEME_PAIR_ICONS[registryId]) return true;
  if (AGENT_THEME_NATIVE_ICONS.has(registryId)) return true;
  const remapped = AGENT_ICON_REMAP[registryId];
  if (remapped && AGENT_THEME_NATIVE_ICONS.has(remapped)) return true;
  const aliases = AGENT_ICON_ALIASES[registryId] ?? [];
  return aliases.some((name) => AGENT_THEME_NATIVE_ICONS.has(name));
}
