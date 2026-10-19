import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import type { AgentSessionOpRequest } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { GitForkIcon, RotateIcon } from "@/ui/icons/lucide-native";
import { copy } from "./copy";

/** Tailwind v4 `sky-500`: `oklch(68.5% 0.169 237.323)`. */
const SKY = "#00a6f4";
const PRIMARY_LIGHT = "#18181b";
const PRIMARY_DARK = "#e4e4e7";
const PRIMARY_INK_LIGHT = "#fafafa";
const PRIMARY_INK_DARK = "#18181b";

function sessionOpOptionIsGhost(kind: string | undefined, optionId: string): boolean {
  const normalized = (kind ?? optionId)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (
    normalized.includes("cancel") || normalized.includes("reject") || normalized.includes("deny")
  );
}

export function AgentChatSessionOpCard({
  request,
  onRespond,
}: {
  request: AgentSessionOpRequest;
  onRespond: (input: { requestId: string; optionId: string }) => void;
}) {
  const theme = useMobileTheme();
  const { height } = useWindowDimensions();
  const isDark = theme.isDark;
  const foreground = theme.colors.label;
  const muted = theme.colors.secondaryLabel;
  const Icon = request.kind === "fork" ? GitForkIcon : RotateIcon;
  const heading =
    request.title.trim() || (request.kind === "fork" ? copy.sessionOpFork : copy.sessionOpRewind);

  return (
    <ScrollView
      contentContainerStyle={{ gap: 8 }}
      style={{
        backgroundColor: isDark ? "#09090b" : "#ffffff",
        borderColor: isDark ? "rgba(250, 250, 250, 0.2)" : "rgba(9, 9, 11, 0.2)",
        borderCurve: "continuous",
        borderRadius: 22,
        borderWidth: 1,
        maxHeight: height * 0.4,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <Icon color={SKY} size={16} strokeWidth={2} />
        <Text style={{ color: SKY, fontSize: 14, fontWeight: "500", lineHeight: 20 }}>
          {copy.sessionOpRequested}
        </Text>
      </View>
      {heading ? (
        <Text style={{ color: muted, fontSize: 14, lineHeight: 20 }}>{heading}</Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        {request.options.map((option) => {
          const ghost = sessionOpOptionIsGhost(option.kind, option.option_id);
          const label = option.name.trim() || option.option_id;
          return (
            <Pressable
              accessibilityRole="button"
              key={option.option_id}
              onPress={() =>
                onRespond({ requestId: request.request_id, optionId: option.option_id })
              }
              style={{
                backgroundColor: ghost ? "transparent" : isDark ? PRIMARY_DARK : PRIMARY_LIGHT,
                borderColor: ghost ? "transparent" : isDark ? PRIMARY_DARK : PRIMARY_LIGHT,
                borderRadius: 999,
                borderWidth: 1,
                flex: 1,
                flexBasis: 0,
                height: 32,
                justifyContent: "center",
                maxWidth: 352,
                paddingHorizontal: 12,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: ghost ? foreground : isDark ? PRIMARY_INK_DARK : PRIMARY_INK_LIGHT,
                  fontSize: 14,
                  fontWeight: "500",
                  lineHeight: 20,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
