import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { AgentQueueItem } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ListOrderedIcon,
  PencilIcon,
  TrashIcon,
} from "@/ui/icons/lucide-native";
import { chatForeground, chatForeground90, chatMutedForeground } from "../chat-ink";
import { moveQueueItem, queueItemText } from "../composer-cards";
import { copy } from "../copy";

export function QueueCard({
  items,
  onDelete,
  onReorder,
  onUpdate,
}: {
  items: AgentQueueItem[];
  onDelete: (itemId: string) => Promise<void>;
  onReorder: (itemIds: string[]) => Promise<void>;
  onUpdate: (itemId: string, text: string) => Promise<void>;
}) {
  const theme = useMobileTheme();
  const muted = chatMutedForeground(theme.isDark);
  const foreground = chatForeground(theme.isDark);
  const [open, setOpen] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const activeEditId =
    editingId != null && items.some((item) => item.id === editingId) ? editingId : null;
  const ids = items.map((item) => item.id);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={styles.header}
      >
        <ListOrderedIcon color={muted} size={16} strokeWidth={2} />
        <Text
          style={{
            color: chatForeground90(theme.isDark),
            fontSize: 14,
            fontWeight: "500",
            lineHeight: 20,
          }}
        >
          {copy.messageQueueTitle}
        </Text>
        <Text style={[styles.count, { color: muted }]}>{items.length}</Text>
      </Pressable>
      {open ? (
        <View style={styles.list}>
          {items.map((item) => {
            const editing = activeEditId === item.id;
            const prompt = queueItemText(item);
            return (
              <View key={item.id} style={styles.row}>
                {editing ? (
                  <TextInput
                    multiline
                    onChangeText={setDraft}
                    style={[styles.draft, { color: foreground }]}
                    value={draft}
                  />
                ) : (
                  <Text numberOfLines={1} style={[styles.prompt, { color: foreground }]}>
                    {prompt}
                  </Text>
                )}
                <View style={styles.actions}>
                  {editing ? (
                    <QueueIcon
                      icon={CheckIcon}
                      label={copy.queueSave}
                      onPress={() => {
                        void onUpdate(item.id, draft)
                          .then(() => setEditingId(null))
                          .catch(() => undefined);
                      }}
                    />
                  ) : (
                    <QueueIcon
                      icon={PencilIcon}
                      label={copy.queueEdit}
                      onPress={() => {
                        setEditingId(item.id);
                        setDraft(prompt);
                      }}
                    />
                  )}
                  <QueueIcon
                    icon={TrashIcon}
                    label={copy.queueDelete}
                    onPress={() => {
                      void onDelete(item.id).catch(() => undefined);
                    }}
                  />
                  <QueueIcon
                    disabled={editing || moveQueueItem(ids, item.id, "up") == null}
                    icon={ChevronUpIcon}
                    label={copy.queueMoveUp}
                    onPress={() => {
                      const next = moveQueueItem(ids, item.id, "up");
                      if (!next) return;
                      void onReorder(next).catch(() => undefined);
                    }}
                  />
                  <QueueIcon
                    disabled={editing || moveQueueItem(ids, item.id, "down") == null}
                    icon={ChevronDownIcon}
                    label={copy.queueMoveDown}
                    onPress={() => {
                      const next = moveQueueItem(ids, item.id, "down");
                      if (!next) return;
                      void onReorder(next).catch(() => undefined);
                    }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function QueueIcon({
  disabled,
  icon: Icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: typeof PencilIcon;
  label: string;
  onPress: () => void;
}) {
  const theme = useMobileTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={styles.iconButton}
    >
      <Icon
        color={chatMutedForeground(theme.isDark)}
        size={14}
        strokeWidth={2}
        style={{ opacity: disabled ? 0.4 : 1 }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: "center",
    flexDirection: "row",
  },
  count: {
    fontSize: 14,
    lineHeight: 20,
    marginLeft: "auto",
    marginRight: 4,
  },
  draft: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    padding: 0,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  iconButton: {
    alignItems: "center",
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  list: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  prompt: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
});
