import { Alert, Pressable, Text, View } from "react-native";
import { formatRelativeTime } from "@atmos/shared/utils/time";
import { BellIcon, CircleCheckIcon, LoaderCircleIcon, ShieldAlertIcon } from "@/ui/icons/lucide-native";
import { type MobileThemeColors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { type SessionBucket, type SessionInboxRow } from "./session-inbox";
import { formatSessionRowSubtitle } from "./session-row-subtitle";

export function SessionRowList({
  colors,
  omitPlace = false,
  onArchive,
  onPress,
  rows,
}: {
  colors?: MobileThemeColors;
  omitPlace?: boolean;
  onArchive?: (sessionId: string) => Promise<void>;
  onPress?: (row: SessionInboxRow) => void;
  rows: SessionInboxRow[];
}) {
  const theme = useMobileTheme();
  const palette = colors ?? theme.colors;

  return (
    <>
      {rows.map((row, index) => (
        <View key={row.id}>
          {index > 0 ? (
            <View
              style={{
                backgroundColor: palette.separator,
                height: 0.5,
                marginLeft: spacing.separatorInset,
              }}
            />
          ) : null}
          <SessionRow
            colors={palette}
            omitPlace={omitPlace}
            onArchive={
              onArchive && row.archiveSessionId
                ? () => {
                    const sessionId = row.archiveSessionId;
                    if (!sessionId) return;
                    Alert.alert("Archive session", "Hide this session from the inbox.", [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Archive",
                        style: "destructive",
                        onPress: () => {
                          void onArchive(sessionId);
                        },
                      },
                    ]);
                  }
                : undefined
            }
            onPress={onPress && (row.workspaceId || row.terminalCandidateId) ? () => onPress(row) : undefined}
            row={row}
          />
        </View>
      ))}
    </>
  );
}

function SessionRow({
  colors,
  omitPlace,
  onArchive,
  onPress,
  row,
}: {
  colors: MobileThemeColors;
  omitPlace: boolean;
  onArchive?: () => void;
  onPress?: () => void;
  row: SessionInboxRow;
}) {
  const color = bucketColor(row.bucket, colors);
  const Icon = bucketIcon(row.bucket);
  const time = row.updatedAt ? formatRelativeTime(row.updatedAt, "en") : null;
  const subtitle = formatSessionRowSubtitle({ ...row, omitPlace });
  const content = (
    <View
      style={{
        gap: spacing.rowGap,
        minHeight: spacing.rowMinHeight,
        paddingHorizontal: spacing.rowX,
        paddingVertical: spacing.rowY,
      }}
    >
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: spacing.rowTitleGap,
        }}
      >
        <Icon color={color} size={18} />
        <Text
          numberOfLines={1}
          style={[typography.rowTitle, { color: colors.label, flex: 1, fontWeight: "600" }]}
        >
          {row.title}
        </Text>
        {time ? (
          <Text
            style={[
              typography.rowMeta,
              { color: colors.secondaryLabel, fontVariant: ["tabular-nums"] },
            ]}
          >
            {time}
          </Text>
        ) : null}
      </View>
      {subtitle ? (
        <Text
          numberOfLines={2}
          style={[typography.rowSubtitle, { color: colors.secondaryLabel, paddingLeft: 28 }]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress && !onArchive) return content;

  return (
    <Pressable
      accessibilityHint={onArchive ? "Long press to archive" : undefined}
      accessibilityRole="button"
      onLongPress={onArchive}
      onPress={onPress}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.mutedPressed } : undefined)}
    >
      {content}
    </Pressable>
  );
}

function bucketIcon(bucket: SessionBucket) {
  switch (bucket) {
    case "permission":
      return ShieldAlertIcon;
    case "attention":
      return BellIcon;
    case "running":
      return LoaderCircleIcon;
    case "done":
      return CircleCheckIcon;
  }
}

function bucketColor(bucket: SessionBucket, colors: MobileThemeColors) {
  switch (bucket) {
    case "permission":
      return colors.workflowStatusBlocked;
    case "attention":
      return colors.workflowStatusInReview;
    case "running":
      return colors.workflowStatusInProgress;
    case "done":
      return colors.secondaryLabel;
  }
}
