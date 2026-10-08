import { useEffect, useState, type ReactElement } from "react";
import { Image, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import { ArrowUpIcon, ChevronDownIcon, PlusIcon, SquareIcon, XIcon } from "@/ui/icons/lucide-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { AgentChatAddSheet } from "./AgentChatAddSheet";
import { AgentChatModelSheet } from "./AgentChatModelSheet";
import { copy } from "./copy";
import type { ComposerPatch, ComposerPicker, FavoriteModel } from "./model-picker";
import type { ComposerPhoto } from "./photo-attachment";

const LINE_HEIGHT = 22;
const BUTTON_SIZE = 36;
const MAX_LINES = 6;
const glassButton = {
  alignItems: "center" as const,
  borderRadius: 18,
  height: BUTTON_SIZE,
  justifyContent: "center" as const,
  width: BUTTON_SIZE,
};

export function AgentChatComposer(props: {
  text: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  busy: boolean;
  /** Queue and Steer while a turn is running. Hidden once the draft is sent. */
  followUp?: boolean;
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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [contentHeight, setContentHeight] = useState(LINE_HEIGHT);
  const suggestions = props.suggestions ?? [];
  const draftText = props.text.trim();
  const canSend = draftText.length > 0 || props.photos.length > 0;
  // Follow-up actions only. An empty field after send stays a normal composer.
  const showQueue = props.followUp === true && canSend;
  const showSteer = props.followUp === true && draftText.length > 0;
  const stacked = keyboardVisible || modelsOpen || addOpen || showQueue || contentHeight > LINE_HEIGHT * 1.7 || props.text.includes("\n");
  const sendReady = canSend && !props.busy;
  const sendIcon = sendReady ? theme.colors.labelInverse : props.busy ? theme.colors.label : theme.colors.secondaryLabel;
  const modelLabel = props.picker.triggerLabel || props.picker.modelLabel || copy.model;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (props.text.length === 0) setContentHeight(LINE_HEIGHT);
  }, [props.text]);

  const renderPlus = () => (
    <GlassPanel interactive shadow={false} style={glassButton}>
      <Pressable
        accessibilityLabel={copy.add}
        accessibilityRole="button"
        onPressIn={() => setAddOpen(true)}
        style={({ pressed }) => ({
          alignItems: "center",
          height: 36,
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
          width: 36,
        })}
      >
        <PlusIcon color={theme.colors.label} size={20} strokeWidth={2.2} />
      </Pressable>
    </GlassPanel>
  );

  const renderSend = () => {
    const button = (
      <Pressable
        accessibilityLabel={props.busy ? props.stopLabel : props.sendLabel}
        accessibilityRole="button"
        disabled={!props.busy && !canSend}
        onPress={props.busy ? props.onStop : props.onSend}
        style={({ pressed }) => ({
          alignItems: "center",
          backgroundColor: sendReady ? (pressed ? theme.colors.primaryPressed : theme.colors.label) : "transparent",
          borderRadius: 18,
          height: 36,
          justifyContent: "center",
          opacity: !props.busy && !canSend ? 0.45 : pressed && !sendReady ? 0.6 : 1,
          width: 36,
        })}
      >
        {props.busy ? (
          <SquareIcon color={sendIcon} size={12} strokeWidth={2.4} />
        ) : (
          <ArrowUpIcon color={sendIcon} size={18} strokeWidth={2.6} />
        )}
      </Pressable>
    );
    if (sendReady) return button;
    return (
      <GlassPanel interactive={props.busy} shadow={false} style={glassButton}>
        {button}
      </GlassPanel>
    );
  };

  const renderFollowUp = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingHorizontal: 2 })}
    >
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 15, lineHeight: 20 }}>{label}</Text>
    </Pressable>
  );

  const renderModel = () => (
    <Pressable
      accessibilityLabel={modelLabel}
      accessibilityRole="button"
      onPressIn={() => setModelsOpen(true)}
      style={({ pressed }) => ({
        alignItems: "center",
        flexDirection: "row",
        flexShrink: 1,
        gap: 4,
        opacity: pressed ? 0.6 : 1,
        paddingRight: 8,
      })}
    >
      <MobileAgentIcon agentId={props.picker.agentId} iconUrl={props.picker.agentIconUrl} size={16} />
      <Text numberOfLines={1} style={{ color: theme.colors.secondaryLabel, flexShrink: 1, fontSize: 15, lineHeight: 20 }}>
        {modelLabel}
      </Text>
      <ChevronDownIcon color={theme.colors.secondaryLabel} size={14} strokeWidth={2.4} />
    </Pressable>
  );

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
      <View
        style={{
          backgroundColor: theme.colors.control,
          borderColor: theme.colors.controlBorder,
          borderCurve: "continuous",
          borderRadius: 28,
          borderWidth: StyleSheet.hairlineWidth,
          overflow: "hidden",
          width: "100%",
        }}
      >
        <View
          style={{
            overflow: "hidden",
            paddingBottom: stacked ? 8 : 18,
            paddingLeft: stacked ? 16 : 60,
            paddingRight: stacked ? 16 : 60,
            paddingTop: stacked ? 16 : 18,
          }}
        >
          <TextInput
            multiline
            onChangeText={props.onChangeText}
            onContentSizeChange={(event) => {
              const next = Math.ceil(event.nativeEvent.contentSize.height);
              setContentHeight((current) => (Math.abs(current - next) < 2 ? current : next));
            }}
            placeholder={props.placeholder}
            placeholderTextColor={theme.colors.secondaryLabel}
            scrollEnabled={stacked}
            style={{
              color: theme.colors.label,
              fontSize: 16,
              lineHeight: LINE_HEIGHT,
              margin: 0,
              maxHeight: stacked ? LINE_HEIGHT * MAX_LINES : LINE_HEIGHT,
              minHeight: LINE_HEIGHT,
              padding: 0,
              textAlignVertical: stacked ? "top" : "center",
            }}
            value={props.text}
          />
        </View>
        <View
          style={stacked
            ? {
                alignItems: "center",
                flexDirection: "row",
                gap: 8,
                minHeight: BUTTON_SIZE,
                paddingBottom: 8,
                paddingHorizontal: 8,
              }
            : {
                alignItems: "center",
                bottom: 0,
                flexDirection: "row",
                left: 8,
                position: "absolute",
                right: 8,
                top: 0,
              }}
        >
          {renderPlus()}
          {stacked ? renderModel() : null}
          <View style={{ flex: 1 }} />
          {showQueue ? renderFollowUp(props.queueLabel, props.onQueue) : null}
          {showSteer ? renderFollowUp(props.steerLabel, props.onSteer) : null}
          {renderSend()}
        </View>
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
