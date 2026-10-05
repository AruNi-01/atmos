import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppScreen, EmptyState, InlineError, ListLoadMoreFooter, Section } from "@/ui/layout/app-screen";
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
import { openSessionDestination } from "@/features/agent-chat/navigation";
import {
  filterSessionRows,
  isSessionBucket,
  orderPinnedRows,
  sessionPinId,
  sortSessionRowsByRecency,
  type SessionBucket,
  type SessionInboxCard,
  type SessionInboxRow,
} from "./session-inbox";
import { SessionRowList } from "./session-row-list";
import { type SessionDeleteChoice } from "./session-row-actions";
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
      {inbox.isLoading && inbox.recent.length === 0 && inbox.pinnedIds.length === 0 ? (
        <Section label="Recent">
          <ListSkeleton />
        </Section>
      ) : inbox.recent.length === 0 && inbox.pinnedIds.length === 0 ? (
        <Section>
          <EmptyState layout="section" message="Sessions from your workspaces show up here." title="No sessions" />
        </Section>
      ) : (
        <SessionHomeLists
          archiveChat={inbox.archiveChat}
          deleteChat={inbox.deleteChat}
          onPress={(row) => openSessionRow(router, row)}
          pinnedIds={inbox.pinnedIds}
          recent={inbox.recent}
          rows={inbox.rows}
          togglePin={inbox.togglePin}
        />
      )}
      <InlineError message={inbox.error} />
    </AppScreen>
  );
}

export function SessionBucketScreen({ bucket }: { bucket: string | undefined }) {
  const router = useRouter();
  const inbox = useSessionInbox();
  const { onRefresh, refreshing } = usePullRefresh(inbox.refresh);
  const parsed = bucket && isSessionBucket(bucket) ? bucket : null;
  const rows = parsed
    ? orderPinnedRows(
        sortSessionRowsByRecency(filterSessionRows(inbox.rows, parsed)),
        inbox.pinnedIds,
        sessionPinId,
      )
    : [];

  if (!inbox.connected) {
    return (
      <AppScreen>
        <EmptyState message={DISCONNECTED_MESSAGE} title={DISCONNECTED_TITLE} />
      </AppScreen>
    );
  }

  const bucketCount = parsed ? (inbox.cards.find((card) => card.bucket === parsed)?.count ?? 0) : 0;
  const fillWhenShort = rows.length < bucketCount && inbox.hasNextPage && !inbox.fetchNextPageFailed;

  return (
    <AppScreen
      fillWhenShort={fillWhenShort}
      onEndReached={inbox.retryNextPage}
      onRefresh={onRefresh}
      refreshing={refreshing}
    >
      {parsed ? (
        <Section>
          {inbox.isLoading || (rows.length === 0 && fillWhenShort) ? (
            <ListSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState layout="section" message="This list is empty." title="No sessions" />
          ) : (
            <SessionRowList
              onArchiveChat={(row) =>
                row.chatId ? inbox.archiveChat(sessionPinId(row), row.chatId) : Promise.resolve()
              }
              onDeleteChat={(row, choice) =>
                row.chatId
                  ? inbox.deleteChat(sessionPinId(row), row.chatId, choice)
                  : Promise.resolve()
              }
              onPress={(row) => openSessionRow(router, row)}
              onTogglePin={inbox.togglePin}
              pinnedIds={inbox.pinnedIds}
              rows={rows}
            />
          )}
        </Section>
      ) : (
        <EmptyState message="This session list is not available." title="Unknown list" />
      )}
      <ListLoadMoreFooter loading={inbox.isFetchingNextPage} />
      <InlineError message={inbox.error} />
    </AppScreen>
  );
}

function SessionHomeLists({
  archiveChat,
  deleteChat,
  onPress,
  pinnedIds,
  recent,
  rows,
  togglePin,
}: {
  archiveChat: (sessionId: string, chatId: string) => Promise<void>;
  deleteChat: (sessionId: string, chatId: string, choice: SessionDeleteChoice) => Promise<void>;
  onPress: (row: SessionInboxRow) => void;
  pinnedIds: readonly string[];
  recent: SessionInboxRow[];
  rows: SessionInboxRow[];
  togglePin: (sessionId: string) => void;
}) {
  const pinnedSet = new Set(pinnedIds);
  const pinnedRows = pinnedIds.flatMap((id) => {
    const row = rows.find((item) => sessionPinId(item) === id);
    return row ? [row] : [];
  });
  const recentRows = recent.filter((row) => !pinnedSet.has(sessionPinId(row)));
  const rowActions = {
    onArchiveChat: (row: SessionInboxRow) =>
      row.chatId ? archiveChat(sessionPinId(row), row.chatId) : Promise.resolve(),
    onDeleteChat: (row: SessionInboxRow, choice: SessionDeleteChoice) =>
      row.chatId ? deleteChat(sessionPinId(row), row.chatId, choice) : Promise.resolve(),
    onTogglePin: togglePin,
    pinnedIds,
  };

  if (pinnedRows.length === 0 && recentRows.length === 0) return null;

  return (
    <>
      {pinnedRows.length > 0 ? (
        <Section label="Pinned">
          <SessionRowList onPress={onPress} rows={pinnedRows} {...rowActions} />
        </Section>
      ) : null}
      {recentRows.length > 0 ? (
        <Section label="Recent">
          <SessionRowList onPress={onPress} rows={recentRows} {...rowActions} />
        </Section>
      ) : null}
    </>
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
  const href = openSessionDestination(row);
  if (!href) return;
  router.push(href);
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
