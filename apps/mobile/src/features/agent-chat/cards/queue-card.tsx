import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { AgentQueueItem } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { GlassTextButton } from "@/ui/primitives/glass-action-buttons";
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
                <GlassTextButton
                  label={copy.queueSave}
                  onPress={() => {
                    void onUpdate(item.id, draft)
                      .then(() => setEditingId(null))
                      .catch(() => undefined);
                  }}
                />
              ) : (
                <GlassTextButton
                  label={copy.queueEdit}
                  onPress={() => {
                    setEditingId(item.id);
                    setDraft(prompt);
                  }}
                />
              )}
              <GlassTextButton
                label={copy.queueDelete}
                onPress={() => {
                  void onDelete(item.id).catch(() => undefined);
                }}
                role="destructive"
              />
              <GlassTextButton
                disabled={moveQueueItem(ids, item.id, "up") == null}
                label={copy.queueMoveUp}
                onPress={() => {
                  const next = moveQueueItem(ids, item.id, "up");
                  if (!next) return;
                  void onReorder(next).catch(() => undefined);
                }}
              />
              <GlassTextButton
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

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
