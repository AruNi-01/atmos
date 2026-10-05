import { Image, type ImageSourcePropType, StyleSheet, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { BotIcon } from "@/ui/icons/lucide-native";

const AGENT_ICON_ALIASES: Record<string, string[]> = {
  // NOTE: do NOT alias bare "agent" → cursor (APP-036 contested freehand identity).
  ampcode: ["amp"],
  "antigravity-acp": ["antigravity"],
  "antigravity-cli": ["antigravity"],
  "augment": ["auggie"],
  "claude-acp": ["claude-code-acp", "claude-code"],
  "claude-code-acp": ["claude-code"],
  "codebuddy": ["codebuddy-code"],
  "codex-acp": ["codex"],
  "commandcode": ["command-code"],
  "deepseek-harness": ["deepseek"],
  "devin-cli": ["devin"],
  "devin-desktop": ["devin"],
  "factory-droid": ["droid"],
  "github-copilot": ["copilot"],
  "grok": ["grok-build"],
  "hermes": ["hermes-agent"],
  "junie-acp": ["junie"],
  "qwen": ["qwen-code"],
  "roocode": ["roo"],
  "workbuddy": ["codebuddy-code"],
};

const AGENT_ICON_REMAP: Record<string, string> = {
  "amp-acp": "amp",
  "antigravity-cli": "antigravity",
  "augment": "auggie",
  "claude": "claude-code",
  "codebuddy": "codebuddy-code",
  "commandcode": "command-code",
  "devin-cli": "devin",
  "devin-desktop": "devin",
  "grok": "grok-build",
  "hermes": "hermes-agent",
  "kilocode": "kilo",
  "kiro": "kiro-cli",
  "openclaw": "openclaw",
  "qwen": "qwen-code",
  "roocode": "roo",
  "workbuddy": "codebuddy-code",
};

/**
 * White line icons. Light mode tints them to the label color, matching web's
 * `invert` on local agent SVGs. Dark mode leaves them white.
 */
const LIGHT_GLYPHS = new Set([
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

/** Black line icons. Dark mode tints them light; light mode keeps them black. */
const DARK_GLYPHS = new Set([
  "cline",
  "devin",
  "grok",
  "grok-build",
  "junie",
  "junie-acp",
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

/** Point size of an SF Symbol in a native menu row. */
const MENU_ICON_POINT_SIZE = 18;

/**
 * Image icon for a native menu row. The bundled marks are 96px, which UIKit
 * draws at 96pt unless the source scale is raised. Keep the packager asset
 * flag so debug builds can still load the file.
 */
export function mobileAgentMenuIcon(agentId: string): {
  source: ImageSourcePropType;
  tinted: boolean;
  type: "image";
} | undefined {
  const iconName = resolveAgentIconName(agentId);
  if (!iconName) return undefined;
  const asset = AGENT_ICON_ASSETS[iconName];
  const resolved = asset ? Image.resolveAssetSource(asset) : undefined;
  if (!resolved?.uri || !resolved.width) return undefined;
  const tinted = matchesGlyph(agentId, iconName, LIGHT_GLYPHS) || matchesGlyph(agentId, iconName, DARK_GLYPHS);
  const pixels = resolved.width * (resolved.scale || 1);
  return {
    source: {
      ...resolved,
      width: MENU_ICON_POINT_SIZE,
      height: MENU_ICON_POINT_SIZE,
      scale: pixels / MENU_ICON_POINT_SIZE,
    },
    tinted,
    type: "image",
  };
}

export function MobileAgentIcon({
  agentId,
  iconUrl,
  size = 18,
  tintColor,
}: {
  agentId: string;
  iconUrl?: string | null;
  size?: number;
  /** Series color for chart legends. Omit it to keep the theme glyph tint. */
  tintColor?: string;
}) {
  const theme = useMobileTheme();
  const iconName = resolveAgentIconName(agentId);
  const source = iconName ? AGENT_ICON_ASSETS[iconName] : undefined;
  const remote = iconUrl?.trim() ?? "";

  if (!source && remote.length > 0) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: remote }}
        style={[styles.icon, { height: size, width: size }]}
      />
    );
  }

  if (!source) {
    return (
      <View style={[styles.fallback, { height: size, width: size }]}>
        <BotIcon color={theme.colors.secondaryLabel} size={size} strokeWidth={2.4} />
      </View>
    );
  }

  const resolvedIconName = iconName ?? agentId;
  const tint = tintColor ?? glyphTint(agentId, resolvedIconName, theme.isDark, theme.colors.label);

  return (
    <Image
      accessibilityIgnoresInvertColors
      source={source}
      style={[
        styles.icon,
        { height: size, width: size },
        tint ? { tintColor: tint } : null,
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

function matchesGlyph(agentId: string, iconName: string, glyphs: Set<string>) {
  if (glyphs.has(iconName) || glyphs.has(agentId)) return true;
  const remapped = AGENT_ICON_REMAP[agentId];
  return Boolean(remapped && glyphs.has(remapped));
}

function glyphTint(agentId: string, iconName: string, isDark: boolean, label: string) {
  if (matchesGlyph(agentId, iconName, DARK_GLYPHS)) return isDark ? label : undefined;
  if (matchesGlyph(agentId, iconName, LIGHT_GLYPHS)) return isDark ? undefined : label;
  return undefined;
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
