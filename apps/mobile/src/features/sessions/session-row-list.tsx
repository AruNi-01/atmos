import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { formatRelativeTime } from "@atmos/shared/utils/time";
import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import { type MobileThemeColors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { TitleSkeleton } from "@/ui/primitives/list-skeleton";
import { SessionSwipeRow } from "@/ui/primitives/session-swipe-row";
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
  const pinned = new Set(pinnedIds ?? []);
  const [deleteRow, setDeleteRow] = useState<SessionInboxRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const swipeEnabled = Boolean(onTogglePin);

  return (
    <>
      {actionError && !deleteRow ? (
        <Text style={{ color: palette.red, fontSize: 13, paddingHorizontal: spacing.rowX, paddingVertical: 8 }}>
          {actionError}
        </Text>
      ) : null}
      {rows.map((row, index) => {
        const sessionId = sessionPinId(row);
        const canManageChat = row.kind === "chat" && Boolean(row.chatId);
        const content = (
          <SessionRow
            colors={palette}
            omitPlace={omitPlace}
            onPress={onPress && (row.workspaceId || row.terminalCandidateId) ? () => onPress(row) : undefined}
            pinned={pinned.has(sessionId)}
            row={row}
          />
        );
        return (
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
            {swipeEnabled && onTogglePin ? (
              <SessionSwipeRow
                backgroundColor={palette.cardElevated}
                onArchive={
                  canManageChat && onArchiveChat
                    ? () => {
                        setActionError(null);
                        void onArchiveChat(row).catch((error: unknown) => {
                          setActionError(errorText(error, "Could not archive this session."));
                        });
                      }
                    : undefined
                }
                onDelete={
                  canManageChat && onDeleteChat
                    ? () => {
                        setDeleteRow(row);
                      }
                    : undefined
                }
                onPin={() => onTogglePin(sessionId)}
                pinLabel={pinned.has(sessionId) ? "Unpin" : "Pin"}
              >
                {content}
              </SessionSwipeRow>
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
  row,
}: {
  colors: MobileThemeColors;
  omitPlace: boolean;
  onPress?: () => void;
  pinned: boolean;
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

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.mutedPressed } : undefined)}
    >
      {content}
    </Pressable>
  );
}
