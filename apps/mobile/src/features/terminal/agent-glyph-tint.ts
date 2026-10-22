/**
 * Bundled agent marks are either white line art or black line art.
 * Light surfaces tint white art to the label color. Dark surfaces tint black art light.
 * A token-usage popover is always a dark gray bubble, so it must tint as a dark surface
 * even when the rest of the app is light.
 */
export const AGENT_ICON_REMAP: Record<string, string> = {
  "amp-acp": "amp",
  "antigravity-cli": "antigravity",
  augment: "auggie",
  claude: "claude-code",
  codebuddy: "codebuddy-code",
  commandcode: "command-code",
  "devin-cli": "devin",
  "devin-desktop": "devin",
  grok: "grok-build",
  hermes: "hermes-agent",
  kilocode: "kilo",
  kiro: "kiro-cli",
  openclaw: "openclaw",
  qwen: "qwen-code",
  roocode: "roo",
  workbuddy: "codebuddy-code",
};

export const LIGHT_GLYPHS = new Set([
  "amp",
  "antigravity",
  "auggie",
  "claude-acp",
  "claude-code",
  "claude-code-acp",
  "codebuddy-code",
  "codex",
  "codex-acp",
  "command-code",
  "copilot",
  "corust-agent",
  "cursor",
  "droid",
  "factory-droid",
  "gemini",
  "github-copilot",
  "goose",
  "kilo",
  "kimi",
  "kiro-cli",
  "mistral-vibe",
  "opencode",
  "qoder",
  "qwen-code",
  "roo",
  "stakpak",
  "trae",
  "windsurf",
]);

export const DARK_GLYPHS = new Set([
  "cline",
  "devin",
  "grok",
  "grok-build",
  "junie",
  "junie-acp",
  "pi",
]);

export function matchesGlyph(agentId: string, iconName: string, glyphs: Set<string>) {
  if (glyphs.has(iconName) || glyphs.has(agentId)) return true;
  const remapped = AGENT_ICON_REMAP[agentId];
  return Boolean(remapped && glyphs.has(remapped));
}

export function glyphTint(agentId: string, iconName: string, isDark: boolean, label: string) {
  if (matchesGlyph(agentId, iconName, DARK_GLYPHS)) return isDark ? label : undefined;
  if (matchesGlyph(agentId, iconName, LIGHT_GLYPHS)) return isDark ? undefined : label;
  return undefined;
}
