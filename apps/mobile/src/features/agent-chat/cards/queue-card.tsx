import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { AgentQueueItem } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const activeEditId =
    editingId != null && items.some((item) => item.id === editingId) ? editingId : null;

  const ids = items.map((item) => item.id);

  return (
    <View style={{ gap: 12 }}>
      {items.map((item) => {
        const editing = activeEditId === item.id;
        const prompt = queueItemText(item);
        return (
          <View key={item.id} style={{ gap: 8 }}>
            {editing ? (
              <TextInput
                multiline
                onChangeText={setDraft}
                style={{
                  borderColor: theme.colors.controlBorder,
                  borderCurve: "continuous",
                  borderRadius: 12,
                  borderWidth: StyleSheet.hairlineWidth,
                  color: theme.colors.label,
                  fontSize: 15,
                  lineHeight: 20,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
                value={draft}
              />
            ) : (
              <Text selectable style={{ color: theme.colors.label, fontSize: 15, lineHeight: 20 }}>
                {prompt}
              </Text>
            )}
            <View style={styles.actions}>
              {editing ? (
                <QueueAction
                  label={copy.queueSave}
                  onPress={() => {
                    void onUpdate(item.id, draft)
                      .then(() => setEditingId(null))
                      .catch(() => undefined);
                  }}
                />
              ) : (
                <QueueAction
                  label={copy.queueEdit}
                  onPress={() => {
                    setEditingId(item.id);
                    setDraft(prompt);
                  }}
                />
              )}
              <QueueAction
                label={copy.queueDelete}
                onPress={() => {
                  void onDelete(item.id).catch(() => undefined);
                }}
              />
              <QueueAction
                disabled={moveQueueItem(ids, item.id, "up") == null}
                label={copy.queueMoveUp}
                onPress={() => {
                  const next = moveQueueItem(ids, item.id, "up");
                  if (!next) return;
                  void onReorder(next).catch(() => undefined);
                }}
              />
              <QueueAction
                disabled={moveQueueItem(ids, item.id, "down") == null}
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
  );
}

function QueueAction({
  disabled,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useMobileTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.colors.mutedPressed : theme.colors.control,
        borderColor: theme.colors.controlBorder,
        borderCurve: "continuous",
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        opacity: disabled ? 0.4 : 1,
        paddingHorizontal: 12,
        paddingVertical: 8,
      })}
    >
      <Text style={{ color: theme.colors.label, fontSize: 14, fontWeight: "600", lineHeight: 20 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
