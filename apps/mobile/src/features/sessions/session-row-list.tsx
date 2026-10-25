import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { formatRelativeTime } from "@atmos/shared/utils/time";
import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import { type MobileThemeColors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { ArchiveIcon, PinIcon, TrashIcon } from "@/ui/icons/lucide-native";
import { GitMetaLine } from "@/ui/primitives/git-change-counts";
import { TitleSkeleton } from "@/ui/primitives/list-skeleton";
import { SwipeSeparator } from "@/ui/layout/row";
import { SwipeRow, useOpenSwipeRows, type SwipeRowAction } from "@/ui/primitives/swipe-row";
import {
  hiddenSwipeSeparatorIndexes,
  swipeRowClosedCorners,
} from "@/ui/primitives/swipe-row-press";
import { SessionDeletePicker } from "./session-delete-picker";
import { sessionPinId, type SessionInboxRow } from "./session-inbox";
import { type SessionDeleteChoice } from "./session-row-actions";
import { formatSessionRowSubtitle } from "./session-row-subtitle";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function SessionRowList({
  colors,
  omitPlace = false,
  onArchiveChat,
  onDeleteChat,
  onPress,
  onTogglePin,
  pinnedIds,
  rows,
}: {
  colors?: MobileThemeColors;
  omitPlace?: boolean;
  onArchiveChat?: (row: SessionInboxRow) => Promise<void>;
  onDeleteChat?: (row: SessionInboxRow, choice: SessionDeleteChoice) => Promise<void>;
  onPress?: (row: SessionInboxRow) => void;
  onTogglePin?: (sessionId: string) => void;
  pinnedIds?: readonly string[];
  rows: SessionInboxRow[];
}) {
  const theme = useMobileTheme();
  const palette = colors ?? theme.colors;
  const { openIds, setOpen } = useOpenSwipeRows();
  const hiddenSeparators = new Set(
    hiddenSwipeSeparatorIndexes(
      rows.flatMap((row, index) => (openIds.includes(row.id) ? [index] : [])),
    ),
  );
  const pinned = new Set(pinnedIds ?? []);
  const [deleteRow, setDeleteRow] = useState<SessionInboxRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const swipeEnabled = Boolean(onTogglePin);

  return (
    <>
      {actionError && !deleteRow ? (
        <Text
          style={{
            color: palette.red,
            fontSize: 13,
            paddingHorizontal: spacing.rowX,
            paddingVertical: 8,
          }}
        >
          {actionError}
        </Text>
      ) : null}
      {rows.map((row, index) => {
        const sessionId = sessionPinId(row);
        const canManageChat = row.kind === "chat" && Boolean(row.chatId);
        const roundedTop = index === 0;
        const roundedBottom = index === rows.length - 1;
        const openRow =
          onPress && (row.workspaceId || row.projectId || row.terminalCandidateId)
            ? () => onPress(row)
            : undefined;
        const content = (
          <SessionRow
            colors={palette}
            omitPlace={omitPlace}
            onPress={swipeEnabled ? undefined : openRow}
            pinned={pinned.has(sessionId)}
            roundedBottom={roundedBottom}
            roundedTop={roundedTop}
            row={row}
          />
        );
        const trailing: SwipeRowAction[] = [];
        if (canManageChat && onArchiveChat) {
          trailing.push({
            color: palette.swipeArchive,
            icon: <ArchiveIcon color={palette.ctaLabel} size={20} />,
            label: "Archive",
            onPress: () => {
              setActionError(null);
              void onArchiveChat(row).catch((error: unknown) => {
                setActionError(errorText(error, "Could not archive this session."));
              });
            },
          });
        }
        if (canManageChat && onDeleteChat) {
          trailing.push({
            color: palette.swipeDelete,
            icon: <TrashIcon color={palette.ctaLabel} size={20} />,
            label: "Delete",
            onPress: () => setDeleteRow(row),
          });
        }
        return (
          <View key={row.id}>
            {index > 0 ? <SwipeSeparator hidden={hiddenSeparators.has(index)} /> : null}
            {swipeEnabled && onTogglePin ? (
              <SwipeRow
                leading={[
                  {
                    color: palette.swipePin,
                    icon: <PinIcon color={palette.ctaLabel} size={20} />,
                    label: pinned.has(sessionId) ? "Unpin" : "Pin",
                    onPress: () => onTogglePin(sessionId),
                  },
                ]}
                onPress={openRow}
                onRevealedChange={(open) => setOpen(row.id, open)}
                roundedBottom={roundedBottom}
                roundedTop={roundedTop}
                trailing={trailing}
              >
                {content}
              </SwipeRow>
            ) : (
              content
            )}
          </View>
        );
      })}
      {onDeleteChat ? (
        <SessionDeletePicker
          busy={deleting}
          error={actionError}
          isPresented={deleteRow != null}
          onDismiss={() => {
            if (!deleting) {
              setDeleteRow(null);
              setActionError(null);
            }
          }}
          onConfirm={(choice) => {
            const row = deleteRow;
            if (!row) return;
            setDeleting(true);
            setActionError(null);
            void onDeleteChat(row, choice)
              .then(() => setDeleteRow(null))
              .catch((error: unknown) => {
                setActionError(errorText(error, "Could not delete this session."));
              })
              .finally(() => setDeleting(false));
          }}
        />
      ) : null}
    </>
  );
}

function SessionRow({
  colors,
  omitPlace,
  onPress,
  pinned,
  roundedBottom,
  roundedTop,
  row,
}: {
  colors: MobileThemeColors;
  omitPlace: boolean;
  onPress?: () => void;
  pinned: boolean;
  roundedBottom: boolean;
  roundedTop: boolean;
  row: SessionInboxRow;
}) {
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
        <MobileAgentIcon agentId={row.agentId ?? ""} size={18} />
        {row.titlePending ? (
          <View style={{ flex: 1 }}>
            <TitleSkeleton />
          </View>
        ) : (
          <Text
            numberOfLines={1}
            style={[typography.rowTitle, { color: colors.label, flex: 1, fontWeight: "600" }]}
          >
            {row.title}
          </Text>
        )}
        {pinned ? (
          <Text style={[typography.rowMeta, { color: colors.secondaryLabel }]}>Pinned</Text>
        ) : null}
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
      {subtitle || row.additions || row.deletions ? (
        <Text
          numberOfLines={2}
          style={[typography.rowSubtitle, { color: colors.secondaryLabel, paddingLeft: 28 }]}
        >
          <GitMetaLine
            additions={row.additions}
            deletions={row.deletions}
            label={subtitle || row.branch?.trim() || "No branch"}
          />
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return content;

  const corners = swipeRowClosedCorners(roundedTop, roundedBottom);
  return (
    <Pressable
      accessibilityRole="button"
      collapsable={false}
      onPress={onPress}
      style={({ pressed }) =>
        pressed ? { ...corners, backgroundColor: colors.mutedPressed } : corners
      }
    >
      {content}
    </Pressable>
  );
}
