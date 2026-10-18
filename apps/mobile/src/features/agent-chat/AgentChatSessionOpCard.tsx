import { Text, View } from "react-native";
import type { AgentSessionOpRequest } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { GitForkIcon, RotateIcon } from "@/ui/icons/lucide-native";
import { GlassTextButton } from "@/ui/primitives/glass-action-buttons";
import {
  CARD_BODY,
  CARD_GAP,
  CARD_ICON_SIZE,
  CARD_TITLE,
  ChipRow,
  SESSION_OP_SKY,
} from "./cards/expanded-card";
import { copy } from "./copy";

export type AgentChatSessionOpPrompt = AgentSessionOpRequest;

export function AgentChatSessionOpCard({
  request,
  onRespond,
}: {
  request: AgentChatSessionOpPrompt;
  onRespond: (input: { requestId: string; optionId: string }) => void;
}) {
  const theme = useMobileTheme();
  const Icon = request.kind === "fork" ? GitForkIcon : RotateIcon;
  const heading = request.title.trim();
  const body = { color: theme.colors.secondaryLabel, ...CARD_BODY };

  return (
    <View style={{ gap: CARD_GAP }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <Icon color={SESSION_OP_SKY} size={CARD_ICON_SIZE} strokeWidth={2} />
        <Text
          style={{
            color: SESSION_OP_SKY,
            flexShrink: 1,
            fontSize: CARD_TITLE.fontSize,
            fontWeight: "600",
            lineHeight: CARD_TITLE.lineHeight,
          }}
        >
          {copy.sessionOpRequested}
        </Text>
      </View>
      {heading ? (
        <Text selectable style={body}>
          {heading}
        </Text>
      ) : null}
      <ChipRow>
        {request.options.map((option) => {
          const label = option.name.trim() || option.option_id;
          return (
            <GlassTextButton
              key={option.option_id}
              label={label}
              onPress={() =>
                onRespond({ requestId: request.request_id, optionId: option.option_id })
              }
            />
          );
        })}
      </ChipRow>
    </View>
  );
}
