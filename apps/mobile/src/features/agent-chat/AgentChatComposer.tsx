import { useEffect, useRef, useState, type ReactElement } from "react";
import type { AgentSessionUsage } from "@atmos/api-types/ws/dto/agent-chat";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  PlusIcon,
  SquareIcon,
  XIcon,
} from "@/ui/icons/lucide-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { AgentChatAddSheet } from "./AgentChatAddSheet";
import { AgentChatModelSheet } from "./AgentChatModelSheet";
import { contextTriggerLabel } from "./composer-capabilities";
import {
  COMPOSER_COMPACT_PAD_HORIZONTAL,
  COMPOSER_COMPACT_PAD_VERTICAL,
  COMPOSER_EXPANDED_PAD_BOTTOM,
  COMPOSER_EXPANDED_PAD_HORIZONTAL,
  COMPOSER_EXPANDED_PAD_TOP,
  COMPOSER_LINE_HEIGHT,
  COMPOSER_MAX_LINES,
  COMPOSER_TOOLBAR_INSET,
  composerDockExpanded,
  composerDockMinHeight,
  composerDockMotionDuration,
} from "./composer-dock";
import {
  COMPOSER_GLASS_CONTROL_RADIUS,
  COMPOSER_GLASS_CONTROL_SIZE,
  COMPOSER_GLASS_DOCK_RADIUS,
  COMPOSER_GLASS_WELL,
} from "./composer-glass";
import {
  applyComposerPaste,
  pasteChipLabel,
  removeComposerPaste,
  retainComposerPasteChips,
  type ComposerPasteChip,
} from "./composer-paste";
import { copy } from "./copy";
import { useReducedMotion } from "./motion/use-reduced-motion";
import type { ComposerPatch, ComposerPicker, FavoriteModel } from "./model-picker";
import type { ComposerPhoto } from "./photo-attachment";

const LINE_HEIGHT = COMPOSER_LINE_HEIGHT;
const BUTTON_SIZE = COMPOSER_GLASS_CONTROL_SIZE;
const MAX_LINES = COMPOSER_MAX_LINES;
const DOCK_EXPAND_EASE = Easing.out(Easing.cubic);
const glassButton = {
  alignItems: "center" as const,
  borderRadius: COMPOSER_GLASS_CONTROL_RADIUS,
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
  /** Opens the context card already in the lane. Hidden when that card is absent. */
  sessionUsage?: AgentSessionUsage | null;
  onOpenCard?: (id: "context") => void;
  /** Present when the parent expands tokens before send, queue, and steer. */
  pasteChips?: readonly ComposerPasteChip[];
  onPasteChipsChange?: (chips: ComposerPasteChip[]) => void;
}): ReactElement {
  const theme = useMobileTheme();
  const textRef = useRef(props.text);
  const chipsRef = useRef<readonly ComposerPasteChip[]>(props.pasteChips ?? []);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [contentHeight, setContentHeight] = useState(LINE_HEIGHT);
  const suggestions = props.suggestions ?? [];
  const draftText = props.text.trim();
  const canSend = draftText.length > 0 || props.photos.length > 0;
  // Follow-up actions only. An empty field after send stays a normal composer.
  const showQueue = props.followUp === true && canSend;
  const showSteer = props.followUp === true && draftText.length > 0;
  const sendReady = canSend && !props.busy;
  const sendIcon = sendReady
    ? theme.colors.labelInverse
    : props.busy
      ? theme.colors.label
      : theme.colors.secondaryLabel;
  const modelLabel = props.picker.triggerLabel.trim();
  const showModel = modelLabel.length > 0;
  const showNoAgent = props.picker.agents.length === 0 && !showModel;
  const pasteChips = props.pasteChips ?? [];
  const contextLabel = contextTriggerLabel(props.sessionUsage);
  const showContext = contextLabel != null && props.onOpenCard != null;
  const contextA11y =
    contextLabel == null || contextLabel === copy.context
      ? copy.context
      : `${copy.context} ${contextLabel}`;
  const expanded = composerDockExpanded({
    contentHeight,
    focused,
    modelsOpen,
    showQueue,
    showSteer,
    text: props.text,
  });
  const reduceMotion = useReducedMotion();
  const expandProgress = useSharedValue(expanded ? 1 : 0);
  const dockHeight = useSharedValue(composerDockMinHeight({ contentHeight, expanded }));
  const wasExpanded = useRef(expanded);

  useEffect(() => {
    const duration = composerDockMotionDuration({
      expandedChanged: wasExpanded.current !== expanded,
      reduceMotion,
    });
    wasExpanded.current = expanded;
    const timing = { duration, easing: DOCK_EXPAND_EASE };
    expandProgress.set(withTiming(expanded ? 1 : 0, timing));
    dockHeight.set(withTiming(composerDockMinHeight({ contentHeight, expanded }), timing));
  }, [contentHeight, dockHeight, expandProgress, expanded, reduceMotion]);

  const dockStyle = useAnimatedStyle(() => ({
    height: dockHeight.get(),
    overflow: "hidden" as const,
  }));
  const inputPadStyle = useAnimatedStyle(() => ({
    paddingBottom: interpolate(
      expandProgress.get(),
      [0, 1],
      [COMPOSER_COMPACT_PAD_VERTICAL, COMPOSER_EXPANDED_PAD_BOTTOM],
    ),
    paddingLeft: interpolate(
      expandProgress.get(),
      [0, 1],
      [COMPOSER_COMPACT_PAD_HORIZONTAL, COMPOSER_EXPANDED_PAD_HORIZONTAL],
    ),
    paddingRight: interpolate(
      expandProgress.get(),
      [0, 1],
      [COMPOSER_COMPACT_PAD_HORIZONTAL, COMPOSER_EXPANDED_PAD_HORIZONTAL],
    ),
    paddingTop: interpolate(
      expandProgress.get(),
      [0, 1],
      [COMPOSER_COMPACT_PAD_VERTICAL, COMPOSER_EXPANDED_PAD_TOP],
    ),
  }));
  const toolbarStyle = {
    alignItems: "center" as const,
    bottom: COMPOSER_TOOLBAR_INSET,
    flexDirection: "row" as const,
    gap: 8,
    height: BUTTON_SIZE,
    left: COMPOSER_TOOLBAR_INSET,
    position: "absolute" as const,
    right: COMPOSER_TOOLBAR_INSET,
  };

  useEffect(() => {
    textRef.current = props.text;
  }, [props.text]);

  useEffect(() => {
    chipsRef.current = props.pasteChips ?? [];
  }, [props.pasteChips]);

  const onDraftChange = (next: string) => {
    const applied = applyComposerPaste(textRef.current, next);
    if (!props.onPasteChipsChange) {
      textRef.current = next;
      props.onChangeText(next);
      return;
    }
    const retained = retainComposerPasteChips(applied.draft, chipsRef.current, applied.chip);
    textRef.current = applied.draft;
    if (retained !== chipsRef.current) {
      chipsRef.current = retained;
      props.onPasteChipsChange(retained);
    }
    props.onChangeText(applied.draft);
  };

  const onRemovePaste = (id: string) => {
    if (!props.onPasteChipsChange) return;
    const removed = removeComposerPaste(props.text, chipsRef.current, id);
    textRef.current = removed.draft;
    chipsRef.current = removed.chips;
    props.onPasteChipsChange(removed.chips);
    props.onChangeText(removed.draft);
  };

  useEffect(() => {
    if (props.text.length === 0) setContentHeight(LINE_HEIGHT);
  }, [props.text]);

  const renderPlus = () => (
    <GlassPanel {...COMPOSER_GLASS_WELL} style={glassButton}>
      <Pressable
        accessibilityLabel={copy.add}
        accessibilityRole="button"
        onPressIn={() => setAddOpen(true)}
        style={({ pressed }) => ({
          alignItems: "center",
          height: BUTTON_SIZE,
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
          width: BUTTON_SIZE,
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
          backgroundColor: sendReady
            ? pressed
              ? theme.colors.primaryPressed
              : theme.colors.label
            : "transparent",
          borderRadius: COMPOSER_GLASS_CONTROL_RADIUS,
          height: BUTTON_SIZE,
          justifyContent: "center",
          opacity: !props.busy && !canSend ? 0.45 : pressed && !sendReady ? 0.6 : 1,
          width: BUTTON_SIZE,
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
      <GlassPanel {...COMPOSER_GLASS_WELL} interactive={props.busy} style={glassButton}>
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
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 15, lineHeight: 20 }}>
        {label}
      </Text>
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
      <MobileAgentIcon
        agentId={props.picker.agentId}
        iconUrl={props.picker.agentIconUrl}
        size={16}
      />
      <Text
        numberOfLines={1}
        style={{ color: theme.colors.secondaryLabel, flexShrink: 1, fontSize: 15, lineHeight: 20 }}
      >
        {modelLabel}
      </Text>
      <ChevronDownIcon color={theme.colors.secondaryLabel} size={14} strokeWidth={2.4} />
    </Pressable>
  );

  const renderContext = () =>
    showContext ? (
      <GlassPanel
        {...COMPOSER_GLASS_WELL}
        style={{
          alignItems: "center",
          borderRadius: COMPOSER_GLASS_CONTROL_RADIUS,
          flexShrink: 0,
          height: BUTTON_SIZE,
          justifyContent: "center",
        }}
      >
        <Pressable
          accessibilityLabel={contextA11y}
          accessibilityRole="button"
          onPress={() => props.onOpenCard?.("context")}
          style={({ pressed }) => ({
            alignItems: "center",
            height: BUTTON_SIZE,
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
            paddingHorizontal: 10,
          })}
        >
          <Text
            numberOfLines={1}
            style={{ color: theme.colors.secondaryLabel, fontSize: 13, lineHeight: 18 }}
          >
            {contextLabel}
          </Text>
        </Pressable>
      </GlassPanel>
    ) : null;

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
          <Text
            style={{
              color: theme.colors.secondaryLabel,
              fontSize: 13,
              lineHeight: 18,
              paddingHorizontal: 14,
              paddingTop: 10,
            }}
          >
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
                <Text
                  numberOfLines={1}
                  style={{ color: theme.colors.label, fontSize: 16, lineHeight: 21 }}
                >
                  {row.title}
                </Text>
                {row.detail.length > 0 && row.detail !== row.title ? (
                  <Text
                    numberOfLines={1}
                    style={{ color: theme.colors.secondaryLabel, fontSize: 13, lineHeight: 18 }}
                  >
                    {row.detail}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {pasteChips.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {pasteChips.map((chip) => (
              <GlassPanel
                key={chip.id}
                {...COMPOSER_GLASS_WELL}
                interactive={false}
                style={{
                  alignItems: "center",
                  borderRadius: 16,
                  flexDirection: "row",
                  gap: 6,
                  height: 32,
                  paddingLeft: 10,
                  paddingRight: 6,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{ color: theme.colors.label, fontSize: 13, lineHeight: 18 }}
                >
                  {pasteChipLabel(chip.lineCount)}
                </Text>
                <Pressable
                  accessibilityLabel={copy.close}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => onRemovePaste(chip.id)}
                >
                  <XIcon color={theme.colors.secondaryLabel} size={14} strokeWidth={2.4} />
                </Pressable>
              </GlassPanel>
            ))}
          </View>
        </ScrollView>
      ) : null}
      {props.photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {props.photos.map((photo) => {
              const photoName = photo.filename.trim();
              return (
                <View key={photo.id} style={{ width: 64 }}>
                  <Image
                    alt=""
                    source={{ uri: photo.uri }}
                    style={{ borderRadius: 12, height: 64, width: 64 }}
                  />
                  <Pressable
                    accessibilityLabel={photo.filename}
                    accessibilityRole="button"
                    onPress={() => props.onRemovePhoto(photo.id)}
                    style={{ position: "absolute", right: 4, top: 4 }}
                  >
                    <XIcon color="#fff" size={14} strokeWidth={2.4} />
                  </Pressable>
                  {photoName.length > 0 ? (
                    <Text
                      numberOfLines={1}
                      style={{
                        color: theme.colors.secondaryLabel,
                        fontSize: 11,
                        lineHeight: 14,
                        marginTop: 4,
                      }}
                    >
                      {photoName}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      ) : null}
      <GlassPanel
        {...COMPOSER_GLASS_WELL}
        style={{
          borderRadius: COMPOSER_GLASS_DOCK_RADIUS,
          width: "100%",
        }}
      >
        <Animated.View style={dockStyle}>
          <Animated.View style={inputPadStyle}>
            <TextInput
              multiline
              onBlur={() => setFocused(false)}
              onChangeText={onDraftChange}
              onContentSizeChange={(event) => {
                if (props.text.length === 0) {
                  setContentHeight(LINE_HEIGHT);
                  return;
                }
                const next = Math.ceil(event.nativeEvent.contentSize.height);
                setContentHeight((current) => (Math.abs(current - next) < 2 ? current : next));
              }}
              onFocus={() => setFocused(true)}
              placeholder={props.placeholder}
              placeholderTextColor={theme.colors.secondaryLabel}
              scrollEnabled={expanded && contentHeight > LINE_HEIGHT * MAX_LINES}
              style={{
                backgroundColor: "transparent",
                color: theme.colors.label,
                fontSize: 16,
                lineHeight: LINE_HEIGHT,
                margin: 0,
                maxHeight: expanded ? LINE_HEIGHT * MAX_LINES : LINE_HEIGHT,
                minHeight: LINE_HEIGHT,
                padding: 0,
                textAlignVertical: expanded ? "top" : "center",
                width: "100%",
              }}
              underlineColorAndroid="transparent"
              value={props.text}
            />
          </Animated.View>
          <View pointerEvents="box-none" style={toolbarStyle}>
            {renderPlus()}
            {expanded && showModel ? renderModel() : null}
            {expanded && showNoAgent ? (
              <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12, lineHeight: 16 }}>
                {copy.noAgent}
              </Text>
            ) : null}
            <View pointerEvents="none" style={{ flex: 1 }} />
            {expanded ? renderContext() : null}
            {expanded && showQueue ? renderFollowUp(props.queueLabel, props.onQueue) : null}
            {expanded && showSteer ? renderFollowUp(props.steerLabel, props.onSteer) : null}
            {renderSend()}
          </View>
        </Animated.View>
      </GlassPanel>
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
