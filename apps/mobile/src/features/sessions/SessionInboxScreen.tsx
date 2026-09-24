import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { ListSkeleton } from "@/ui/primitives/list-skeleton";
import { radii } from "@/theme/radii";
import { spacing } from "@/theme/spacing";
import { useMobileTheme } from "@/theme/theme-store";
import {
  BellIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  ShieldAlertIcon,
} from "@/ui/icons/lucide-native";
import { type MobileThemeColors } from "@/theme/colors";
import {
  filterSessionRows,
  isSessionBucket,
  type SessionBucket,
  type SessionInboxCard,
  type SessionInboxRow,
} from "./session-inbox";
import { SessionRowList } from "./session-row-list";
import { useSessionInbox } from "./use-session-inbox";

const DISCONNECTED_TITLE = "Computer not connected";
const DISCONNECTED_MESSAGE = "This phone is not connected to a Computer.";

export function SessionHomeScreen() {
  const router = useRouter();
  const inbox = useSessionInbox();
  const { onRefresh, refreshing } = usePullRefresh(inbox.refresh);

  if (!inbox.connected) {
    return (
      <AppScreen>
        <EmptyState message={DISCONNECTED_MESSAGE} title={DISCONNECTED_TITLE} />
      </AppScreen>
    );
  }

  return (
    <AppScreen onRefresh={onRefresh} refreshing={refreshing}>
      <SessionCardGrid
        cards={inbox.cards}
        onPress={(bucket) =>
          router.push({
            pathname: "/(home)/session/[bucket]",
            params: { bucket },
          })
        }
      />
      {inbox.isLoading && inbox.recent.length === 0 ? (
        <Section label="Recent">
          <ListSkeleton />
        </Section>
      ) : inbox.recent.length > 0 ? (
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
  const { onRefresh, refreshing } = usePullRefresh(inbox.refresh);
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
    <AppScreen onRefresh={onRefresh} refreshing={refreshing}>
      {parsed ? (
        <Section>
          {inbox.isLoading ? (
            <ListSkeleton />
          ) : rows.length === 0 ? (
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

function usePullRefresh(refresh: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);
  return { onRefresh, refreshing };
}

const SESSION_CARD_GAP = 10;
const SESSION_CARD_HEIGHT = 112;

function SessionCardGrid({
  cards,
  onPress,
}: {
  cards: SessionInboxCard[];
  onPress: (bucket: SessionBucket) => void;
}) {
  const lastRowStart = cards.length - (cards.length % 2 === 0 ? 2 : 1);

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        marginHorizontal: -SESSION_CARD_GAP / 2,
      }}
    >
      {cards.map((card, index) => (
        <View
          key={card.bucket}
          style={{
            marginBottom: index >= lastRowStart ? 0 : SESSION_CARD_GAP,
            paddingHorizontal: SESSION_CARD_GAP / 2,
            width: "50%",
          }}
        >
          <SessionCard card={card} onPress={() => onPress(card.bucket)} />
        </View>
      ))}
    </View>
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
        alignItems: "flex-start",
        backgroundColor: theme.colors.cardElevated,
        borderColor: theme.colors.glassBorder,
        borderCurve: "continuous",
        borderRadius: radii.card,
        borderWidth: 1,
        gap: 10,
        height: SESSION_CARD_HEIGHT,
        justifyContent: "center",
        opacity: pressed ? 0.72 : 1,
        paddingBottom: 14,
        paddingHorizontal: spacing.cardPadding,
        paddingTop: 26,
      })}
    >
      <Icon color={color} size={22} />
      <Text
        numberOfLines={2}
        style={{
          color: theme.colors.label,
          fontSize: 16,
          fontWeight: "500",
          lineHeight: 21,
        }}
      >
        {card.label}
        <Text
          style={{
            color: theme.colors.secondaryLabel,
            fontVariant: ["tabular-nums"],
            fontWeight: "400",
          }}
        >
          {" "}
          {card.count}
        </Text>
      </Text>
    </Pressable>
  );
}

function openSessionRow(router: ReturnType<typeof useRouter>, row: SessionInboxRow) {
  if (!row.workspaceId) return;
  router.push({
    pathname: "/workspace/[workspaceId]/terminal",
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
