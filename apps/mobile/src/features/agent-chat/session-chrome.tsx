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
import { CHAT_AMBER } from "./amber-color";
import { chatMutedForeground } from "./chat-ink";
import { sessionChromeCopy, type SessionChromeIcon, type SessionChromeTone } from "./copy";
import { chatDestructiveColor } from "./destructive-color";
import { TextShimmer } from "./motion/text-shimmer";

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

function toneColor(isDark: boolean, tone: SessionChromeTone): string {
  if (tone === "failed" || tone === "error") return chatDestructiveColor(isDark);
  if (tone === "warning") return CHAT_AMBER;
  return chatMutedForeground(isDark);
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
  const muted = chatMutedForeground(theme.isDark);
  const textColor = toneColor(theme.isDark, chrome.tone);
  const iconColor = chrome.tone === "failed" ? muted : textColor;
  const labelStyle = { flexShrink: 1, fontSize: 14, lineHeight: 20 } as const;

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 8, paddingVertical: 2 }}>
      <View style={{ alignItems: "center", height: 16, justifyContent: "center", width: 16 }}>
        <Icon color={iconColor} size={14} />
      </View>
      {chrome.shimmer ? (
        <TextShimmer duration={1} style={labelStyle}>
          {chrome.text}
        </TextShimmer>
      ) : (
        <Text selectable style={{ ...labelStyle, color: textColor }}>
          {chrome.text}
        </Text>
      )}
    </View>
  );
}
