import { Text, View } from "react-native";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  Box,
  Layers,
  MessageCircleMore,
  MessageCirclePlus,
  TriangleAlert,
} from "lucide-react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { sessionChromeCopy, type SessionChromeIcon, type SessionChromeTone } from "./copy";

const ICONS: Record<
  SessionChromeIcon,
  | typeof MessageCircleMore
  | typeof MessageCirclePlus
  | typeof Box
  | typeof Layers
  | typeof TriangleAlert
> = {
  resume: MessageCircleMore,
  create: MessageCirclePlus,
  model: Box,
  layers: Layers,
  hint: TriangleAlert,
};

function toneColor(
  colors: ReturnType<typeof useMobileTheme>["colors"],
  tone: SessionChromeTone,
): string {
  if (tone === "failed" || tone === "error") return colors.red;
  if (tone === "warning") return colors.yellow;
  return colors.secondaryLabel;
}

export function SessionChrome({
  part,
}: {
  part: Extract<
    AgentPart,
    { type: "session_lifecycle" | "session_config_change" | "session_hint" }
  >;
}) {
  const theme = useMobileTheme();
  const chrome = sessionChromeCopy(part);
  const Icon = ICONS[chrome.icon];
  const textColor = toneColor(theme.colors, chrome.tone);
  const iconColor = chrome.tone === "failed" ? theme.colors.secondaryLabel : textColor;

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 8, paddingVertical: 2 }}>
      <View style={{ alignItems: "center", height: 16, justifyContent: "center", width: 16 }}>
        <Icon color={iconColor} size={14} />
      </View>
      <Text
        selectable
        style={{
          color: textColor,
          flexShrink: 1,
          fontSize: 14,
          lineHeight: 20,
        }}
      >
        {chrome.text}
      </Text>
    </View>
  );
}
