import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { AgentQueueItem } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { ListOrderedIcon } from "@/ui/icons/lucide-native";
import { GlassTextButton } from "@/ui/primitives/glass-action-buttons";
import { moveQueueItem, queueItemText } from "../composer-cards";
import { copy } from "../copy";
import { CARD_BODY, CARD_GAP, CardHeader, ChipRow } from "./expanded-card";

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
  const body = { color: theme.colors.label, ...CARD_BODY };

  return (
    <View style={{ gap: CARD_GAP }}>
      <CardHeader count={items.length} icon={ListOrderedIcon} title={copy.messageQueueTitle} />
      {items.map((item) => {
        const editing = activeEditId === item.id;
        const prompt = queueItemText(item);
        return (
          <View key={item.id} style={{ gap: CARD_GAP }}>
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
                  fontSize: CARD_BODY.fontSize,
                  lineHeight: CARD_BODY.lineHeight,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
                value={draft}
              />
            ) : (
              <Text selectable style={body}>
                {prompt}
              </Text>
            )}
            <ChipRow>
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
            </ChipRow>
          </View>
        );
      })}
    </View>
  );
}
