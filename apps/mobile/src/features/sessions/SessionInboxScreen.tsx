import { Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { formatRelativeTime } from "@atmos/shared/utils/time";
import {
  BellIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  ShieldAlertIcon,
} from "@/ui/icons/lucide-native";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { Separator } from "@/ui/layout/row";
import { type MobileThemeColors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import {
  filterSessionRows,
  isSessionBucket,
  type SessionBucket,
  type SessionInboxCard,
  type SessionInboxRow,
} from "./session-inbox";
import { formatSessionRowSubtitle } from "./session-row-subtitle";
import { useSessionInbox } from "./use-session-inbox";

const DISCONNECTED_TITLE = "Computer not connected";
const DISCONNECTED_MESSAGE = "This phone is not connected to a Computer.";

export function SessionHomeScreen() {
  const router = useRouter();
  const theme = useMobileTheme();
  const inbox = useSessionInbox();

  if (!inbox.connected) {
    return (
      <AppScreen>
        <EmptyState message={DISCONNECTED_MESSAGE} title={DISCONNECTED_TITLE} />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <View style={{ gap: 12 }}>
        {inbox.cards.map((card) => (
          <SessionCard
            card={card}
            key={card.bucket}
            onPress={() =>
              router.push({
                pathname: "/(home)/session/[bucket]",
                params: { bucket: card.bucket },
              })
            }
          />
        ))}
      </View>
      {inbox.recent.length > 0 ? (
        <Section label="Recent">
          <SessionRowList
          onArchive={inbox.archiveSession}
          onPress={(row) => openSessionRow(router, row)}
          rows={inbox.recent}
        />
        </Section>
      ) : null}
      <InlineError message={inbox.error} />
    </AppScreen>
  );
}

export function SessionBucketScreen({ bucket }: { bucket: string | undefined }) {
  const router = useRouter();
  const inbox = useSessionInbox();
  const parsed = bucket && isSessionBucket(bucket) ? bucket : null;

  if (!inbox.connected) {
    return (
      <AppScreen>
        <EmptyState message={DISCONNECTED_MESSAGE} title={DISCONNECTED_TITLE} />
      </AppScreen>
    );
  }

  const rows = parsed ? filterSessionRows(inbox.rows, parsed) : [];

  return (
    <AppScreen>
      {parsed ? (
        <Section>
          {inbox.isLoading ? null : rows.length === 0 ? (
            <EmptyState layout="section" message="This list is empty." title="No sessions" />
          ) : (
            <SessionRowList
              onArchive={inbox.archiveSession}
              onPress={(row) => openSessionRow(router, row)}
              rows={rows}
            />
          )}
        </Section>
      ) : (
        <EmptyState message="This session list is not available." title="Unknown list" />
      )}
      <InlineError message={inbox.error} />
    </AppScreen>
  );
}

function SessionCard({ card, onPress }: { card: SessionInboxCard; onPress: () => void }) {
  const theme = useMobileTheme();
  const color = bucketColor(card.bucket, theme.colors);
  const Icon = bucketIcon(card.bucket);

  return (
    <Pressable
      accessibilityLabel={`${card.label}, ${card.count}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? theme.colors.mutedPressed : theme.colors.cardElevated,
        borderCurve: "continuous",
        borderRadius: 24,
        flexDirection: "row",
        gap: 12,
        minHeight: spacing.rowMinHeight,
        paddingHorizontal: spacing.cardPadding,
        paddingVertical: 14,
      })}
    >
      <Icon color={color} size={22} />
      <Text
        style={{
          color: theme.colors.label,
          flex: 1,
          fontSize: 16,
          fontWeight: "600",
          lineHeight: 21,
        }}
      >
        {card.label}
      </Text>
      <Text
        style={{
          color,
          fontSize: 20,
          fontVariant: ["tabular-nums"],
          fontWeight: "700",
          lineHeight: 24,
        }}
      >
        {card.count}
      </Text>
    </Pressable>
  );
}

function SessionRowList({
  onArchive,
  onPress,
  rows,
}: {
  onArchive: (sessionId: string) => Promise<void>;
  onPress: (row: SessionInboxRow) => void;
  rows: SessionInboxRow[];
}) {
  return (
    <>
      {rows.map((row, index) => (
        <View key={row.id}>
          {index > 0 ? <Separator /> : null}
          <SessionRow
            onArchive={
              row.archiveSessionId
                ? () => {
                    Alert.alert("Archive session", "Hide this session from the inbox.", [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Archive",
                        style: "destructive",
                        onPress: () => {
                          void onArchive(row.archiveSessionId!);
                        },
                      },
                    ]);
                  }
                : undefined
            }
            onPress={row.workspaceId ? () => onPress(row) : undefined}
            row={row}
          />
        </View>
      ))}
    </>
  );
}

function SessionRow({
  onArchive,
  onPress,
  row,
}: {
  onArchive?: () => void;
  onPress?: () => void;
  row: SessionInboxRow;
}) {
  const theme = useMobileTheme();
  const color = bucketColor(row.bucket, theme.colors);
  const Icon = bucketIcon(row.bucket);
  const time = row.updatedAt ? formatRelativeTime(row.updatedAt, "en") : null;
  const subtitle = formatSessionRowSubtitle(row);
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
          style={[typography.rowTitle, { color: theme.colors.label, flex: 1, fontWeight: "600" }]}
        >
          {row.title}
        </Text>
        {time ? (
          <Text
            style={[
              typography.rowMeta,
              { color: theme.colors.secondaryLabel, fontVariant: ["tabular-nums"] },
            ]}
          >
            {time}
          </Text>
        ) : null}
      </View>
      {subtitle ? (
        <Text
          numberOfLines={2}
          style={[typography.rowSubtitle, { color: theme.colors.secondaryLabel, paddingLeft: 28 }]}
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
      style={({ pressed }) => (pressed ? { backgroundColor: theme.colors.mutedPressed } : undefined)}
    >
      {content}
    </Pressable>
  );
}

function openSessionRow(router: ReturnType<typeof useRouter>, row: SessionInboxRow) {
  if (!row.workspaceId) return;
  router.push({
    pathname: "/workspace/[workspaceId]",
    params: row.terminalCandidateId
      ? { terminal: row.terminalCandidateId, workspaceId: row.workspaceId }
      : { workspaceId: row.workspaceId },
  });
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
