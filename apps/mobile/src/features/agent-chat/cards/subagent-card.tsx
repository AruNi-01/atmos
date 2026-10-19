import { StyleSheet, Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import {
  BotMessageSquareIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from "@/ui/icons/lucide-native";
import { subagentCountLabel, type SubagentTaskStatus, type SubagentTitle } from "../composer-cards";
import { copy } from "../copy";
import { CARD_BODY, CARD_GAP, CARD_ICON_SIZE, CardHeader } from "./expanded-card";

export function SubagentCard({ items }: { items: SubagentTitle[] }) {
  const theme = useMobileTheme();
  return (
    <View style={{ gap: CARD_GAP }}>
      <CardHeader
        count={subagentCountLabel(items)}
        icon={BotMessageSquareIcon}
        title={copy.subagentTasksTitle}
      />
      {items.map((item, index) => {
        const color =
          item.status === "failed"
            ? theme.colors.red
            : item.status === "running"
              ? theme.colors.label
              : theme.colors.secondaryLabel;
        return (
          <View key={item.id}>
            {index > 0 ? (
              <View
                style={{
                  backgroundColor: theme.colors.separator,
                  height: StyleSheet.hairlineWidth,
                }}
              />
            ) : null}
            <View style={[styles.row, index === items.length - 1 ? styles.rowLast : null]}>
              <SubagentStatusIcon color={color} status={item.status} />
              <Text selectable style={{ color, flex: 1, ...CARD_BODY }}>
                {item.title}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SubagentStatusIcon({ color, status }: { color: string; status: SubagentTaskStatus }) {
  if (status === "failed") {
    return <XCircleIcon color={color} size={CARD_ICON_SIZE} strokeWidth={2} />;
  }
  if (status === "completed") {
    return <CircleCheckIcon color={color} size={CARD_ICON_SIZE} strokeWidth={2} />;
  }
  return <LoaderCircleIcon color={color} size={CARD_ICON_SIZE} strokeWidth={2} />;
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingVertical: 6,
  },
  rowLast: {
    paddingBottom: 0,
  },
});
