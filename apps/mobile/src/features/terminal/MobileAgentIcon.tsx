import { Image, type ImageSourcePropType, StyleSheet, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { BotIcon } from "@/ui/icons/lucide-native";

const AGENT_ICON_ALIASES: Record<string, string[]> = {
  // NOTE: do NOT alias bare "agent" → cursor (APP-036 contested freehand identity).
  "claude-acp": ["claude-code-acp", "claude-code"],
  "claude-code-acp": ["claude-code"],
  "codex-acp": ["codex"],
  "commandcode": ["command-code"],
  "factory-droid": ["droid"],
  "github-copilot": ["copilot"],
  "junie-acp": ["junie"],
};

const AGENT_ICON_REMAP: Record<string, string> = {
  "amp-acp": "amp",
  "claude": "claude-code",
  "commandcode": "command-code",
  "hermes": "hermes-agent",
  "kilocode": "kilo",
  "kiro": "kiro-cli",
  "openclaw": "openclaw",
};

const INVERTED_THEME_ICONS = new Set([
  "cline",
  "junie",
  "junie-acp",
  "devin",
  "grok-build",
]);

const AGENT_ICON_ASSETS: Record<string, ImageSourcePropType> = {
  "amp": require("../../../assets/agents/amp.png"),
  "antigravity": require("../../../assets/agents/antigravity.png"),
  "auggie": require("../../../assets/agents/auggie.png"),
  "claude-acp": require("../../../assets/agents/claude-acp.png"),
  "claude-code": require("../../../assets/agents/claude-code.png"),
  "claude-code-acp": require("../../../assets/agents/claude-code-acp.png"),
  "cline": require("../../../assets/agents/cline.png"),
  "codebuddy-code": require("../../../assets/agents/codebuddy-code.png"),
  "codex": require("../../../assets/agents/codex.png"),
  "codex-acp": require("../../../assets/agents/codex-acp.png"),
  "command-code": require("../../../assets/agents/command-code.png"),
  "copilot": require("../../../assets/agents/copilot.png"),
  "corust-agent": require("../../../assets/agents/corust-agent.png"),
  "cursor": require("../../../assets/agents/cursor.png"),
  "devin": require("../../../assets/agents/devin.png"),
  "droid": require("../../../assets/agents/droid.png"),
  "factory-droid": require("../../../assets/agents/factory-droid.png"),
  "gemini": require("../../../assets/agents/gemini.png"),
  "github-copilot": require("../../../assets/agents/github-copilot.png"),
  "goose": require("../../../assets/agents/goose.png"),
  "grok-build": require("../../../assets/agents/grok-build.png"),
  "hermes-agent": require("../../../assets/agents/hermes-agent.png"),
  "junie": require("../../../assets/agents/junie.png"),
  "kilo": require("../../../assets/agents/kilo.png"),
  "kimi": require("../../../assets/agents/kimi.png"),
  "kiro-cli": require("../../../assets/agents/kiro-cli.png"),
  "mistral-vibe": require("../../../assets/agents/mistral-vibe.png"),
  "openclaw": require("../../../assets/agents/openclaw.jpg"),
  "opencode": require("../../../assets/agents/opencode.png"),
  "pi": require("../../../assets/agents/pi.png"),
  "qoder": require("../../../assets/agents/qoder.png"),
  "qwen-code": require("../../../assets/agents/qwen-code.png"),
  "roo": require("../../../assets/agents/roo.png"),
  "stakpak": require("../../../assets/agents/stakpak.png"),
  "trae": require("../../../assets/agents/trae.png"),
  "windsurf": require("../../../assets/agents/windsurf.png"),
};

export function MobileAgentIcon({
  agentId,
  size = 18,
}: {
  agentId: string;
  size?: number;
}) {
  const theme = useMobileTheme();
  const iconName = resolveAgentIconName(agentId);
  const source = iconName ? AGENT_ICON_ASSETS[iconName] : undefined;

  if (!source) {
    return (
      <View style={[styles.fallback, { height: size, width: size }]}>
        <BotIcon color={theme.colors.terminalMuted} size={size} strokeWidth={2.4} />
      </View>
    );
  }
  const resolvedIconName = iconName ?? agentId;

  return (
    <Image
      accessibilityIgnoresInvertColors
      source={source}
      style={[
        styles.icon,
        { height: size, width: size },
        shouldTintForDarkHeader(agentId, resolvedIconName) ? { tintColor: theme.colors.terminalFg } : null,
      ]}
    />
  );
}

function resolveAgentIconName(agentId: string) {
  const primary = AGENT_ICON_REMAP[agentId] ?? agentId;
  if (AGENT_ICON_ASSETS[primary]) return primary;

  const aliases = AGENT_ICON_ALIASES[agentId] ?? [];
  return aliases.find((alias) => AGENT_ICON_ASSETS[alias]);
}

function shouldTintForDarkHeader(agentId: string, iconName: string) {
  if (INVERTED_THEME_ICONS.has(agentId)) return true;
  const remapped = AGENT_ICON_REMAP[agentId];
  if (remapped && INVERTED_THEME_ICONS.has(remapped)) return true;
  return INVERTED_THEME_ICONS.has(iconName);
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    opacity: 0.95,
    resizeMode: "contain",
  },
});
