import { useState, type ReactElement } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import { ArrowUpIcon, PlusIcon, SquareIcon, XIcon } from "@/ui/icons/lucide-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { AgentChatAddSheet } from "./AgentChatAddSheet";
import { AgentChatModelSheet } from "./AgentChatModelSheet";
import { copy } from "./copy";
import type { ComposerPatch, ComposerPicker, FavoriteModel } from "./model-picker";
import type { ComposerPhoto } from "./photo-attachment";

export function AgentChatComposer(props: {
  text: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  busy: boolean;
  sendLabel: string;
  stopLabel: string;
  queueLabel: string;
  steerLabel: string;
  onSend: () => void;
  onStop: () => void;
  onQueue: () => void;
  onSteer: () => void;
  picker: ComposerPicker;
  favorites: FavoriteModel[];
  onToggleFavorite: (entry: FavoriteModel) => void;
  onPatch: (patch: ComposerPatch) => void;
  photos: ComposerPhoto[];
  onPhotosChange: (photos: ComposerPhoto[]) => void;
  onRemovePhoto: (id: string) => void;
  suggestions?: Array<{ id: string; title: string; detail: string }>;
  suggestionTitle?: string;
  onPickSuggestion?: (id: string) => void;
}): ReactElement {
  const theme = useMobileTheme();
  const [modelsOpen, setModelsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const suggestions = props.suggestions ?? [];
  const canSend = props.text.trim().length > 0 || props.photos.length > 0;
  const sendFill = props.busy || canSend ? theme.colors.label : theme.colors.controlSecondary;
  const sendIcon = props.busy || canSend ? theme.colors.background : theme.colors.secondaryLabel;

  return (
    <View style={{ gap: 12 }}>
      {suggestions.length > 0 ? (
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.glassBorder,
            borderCurve: "continuous",
            borderRadius: radii.card,
            borderWidth: StyleSheet.hairlineWidth,
            overflow: "hidden",
          }}
        >
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13, lineHeight: 18, paddingHorizontal: 14, paddingTop: 10 }}>
            {props.suggestionTitle}
          </Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
            {suggestions.map((row) => (
              <Pressable
                accessibilityRole="button"
                key={row.id}
                onPress={() => props.onPickSuggestion?.(row.id)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? theme.colors.mutedPressed : "transparent",
                  gap: 2,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                })}
              >
                <Text numberOfLines={1} style={{ color: theme.colors.label, fontSize: 16, lineHeight: 21 }}>{row.title}</Text>
                {row.detail.length > 0 && row.detail !== row.title ? (
                  <Text numberOfLines={1} style={{ color: theme.colors.secondaryLabel, fontSize: 13, lineHeight: 18 }}>{row.detail}</Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {props.photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {props.photos.map((photo) => (
              <View key={photo.id}>
                <Image source={{ uri: photo.uri }} style={{ borderRadius: 12, height: 64, width: 64 }} />
                <Pressable
                  accessibilityLabel={photo.filename}
                  accessibilityRole="button"
                  onPress={() => props.onRemovePhoto(photo.id)}
                  style={{ position: "absolute", right: 4, top: 4 }}
                >
                  <XIcon color="#fff" size={14} strokeWidth={2.4} />
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
      <View style={{ alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 4 }}>
        <Pressable
          accessibilityLabel={props.picker.triggerLabel || copy.model}
          accessibilityRole="button"
          onPress={() => setModelsOpen(true)}
          style={{ alignItems: "center", flexDirection: "row", gap: 6 }}
        >
          <MobileAgentIcon agentId={props.picker.agentId} iconUrl={props.picker.agentIconUrl} size={18} />
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 15, lineHeight: 20 }}>
            {props.picker.triggerLabel || copy.model}
          </Text>
        </Pressable>
        {props.busy ? (
          <>
            <Pressable accessibilityRole="button" onPress={props.onQueue}>
              <Text style={{ color: theme.colors.secondaryLabel, fontSize: 15, lineHeight: 20 }}>{props.queueLabel}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={props.onSteer}>
              <Text style={{ color: theme.colors.secondaryLabel, fontSize: 15, lineHeight: 20 }}>{props.steerLabel}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", flexDirection: "row", gap: 10 }}>
        <GlassPanel interactive shadow={false} style={{ alignItems: "center", borderRadius: 22, height: 44, justifyContent: "center", width: 44 }}>
          <Pressable
            accessibilityLabel={copy.add}
            accessibilityRole="button"
            onPress={() => setAddOpen(true)}
            style={({ pressed }) => ({
              alignItems: "center",
              height: 44,
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
              width: 44,
            })}
          >
            <PlusIcon color={theme.colors.secondaryLabel} size={20} strokeWidth={2.2} />
          </Pressable>
        </GlassPanel>
        <GlassPanel interactive shadow={false} style={{ alignItems: "flex-end", borderRadius: 22, flex: 1, flexDirection: "row" }}>
          <TextInput
            multiline
            onChangeText={props.onChangeText}
            placeholder={props.placeholder}
            placeholderTextColor={theme.colors.secondaryLabel}
            style={{
              color: theme.colors.label,
              flex: 1,
              fontSize: 16,
              lineHeight: 22,
              maxHeight: 100,
              paddingLeft: 16,
              paddingRight: 8,
              paddingVertical: 12,
            }}
            value={props.text}
          />
          <Pressable
            accessibilityLabel={props.busy ? props.stopLabel : props.sendLabel}
            accessibilityRole="button"
            disabled={!props.busy && !canSend}
            onPress={props.busy ? props.onStop : props.onSend}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: sendFill,
              borderCurve: "continuous",
              borderRadius: 17,
              height: 34,
              justifyContent: "center",
              margin: 5,
              opacity: pressed ? 0.7 : 1,
              width: 34,
            })}
          >
            {props.busy ? (
              <SquareIcon color={sendIcon} size={12} strokeWidth={2.4} />
            ) : (
              <ArrowUpIcon color={sendIcon} size={16} strokeWidth={2.6} />
            )}
          </Pressable>
        </GlassPanel>
      </View>
      <AgentChatModelSheet
        favorites={props.favorites}
        onClose={() => setModelsOpen(false)}
        onPatch={props.onPatch}
        onToggleFavorite={props.onToggleFavorite}
        picker={props.picker}
        visible={modelsOpen}
      />
      <AgentChatAddSheet
        onPhotosChange={props.onPhotosChange}
        onClose={() => setAddOpen(false)}
        onPatch={props.onPatch}
        photos={props.photos}
        picker={props.picker}
        visible={addOpen}
      />
    </View>
  );
}
