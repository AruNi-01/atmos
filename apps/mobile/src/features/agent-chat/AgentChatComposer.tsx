import { useEffect, useRef, useState, type ReactElement } from "react";
import type { AgentSessionUsage } from "@atmos/api-types/ws/dto/agent-chat";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import { ArrowUpIcon, PlusIcon, SquareIcon, XIcon } from "@/ui/icons/lucide-native";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { AgentChatAddSheet } from "./AgentChatAddSheet";
import { AgentChatModelSheet } from "./AgentChatModelSheet";
import { contextTriggerLabel } from "./composer-capabilities";
import { contextUsageStats } from "./composer-cards";
import { chatForeground, chatMutedForeground } from "./chat-ink";
import {
  CONTEXT_RING_RADIUS,
  CONTEXT_RING_SIZE,
  CONTEXT_RING_STROKE,
  contextBarWarning,
  contextRingDash,
  contextRingTrack,
  contextWindowBarTone,
} from "./context-window";
import {
  applyComposerPaste,
  pasteChipLabel,
  removeComposerPaste,
  retainComposerPasteChips,
  type ComposerPasteChip,
} from "./composer-paste";
import { copy } from "./copy";
import type { ComposerPatch, ComposerPicker, FavoriteModel } from "./model-picker";
import type { ComposerPhoto } from "./photo-attachment";

/** Web prompt field is `text-sm leading-5`, capped at `max-h-40`. */
const LINE_HEIGHT = 20;
const FIELD_FONT_SIZE = 14;
const MAX_LINES = 8;
/** Web plus and send are `size-8`. The shell is `rounded-3xl` (`--radius` + 12). */
const BUTTON_SIZE = 32;
/**
 * Those controls are `Button`s. Every svg without its own opacity is 80%.
 * The empty send stays a glass control at 0.45, so its arrow is not faded again.
 */
export const COMPOSER_GLYPH_OPACITY = 0.8;
const SHELL_RADIUS = 22;
const glassButton = {
  alignItems: "center" as const,
  borderRadius: BUTTON_SIZE / 2,
  height: BUTTON_SIZE,
  justifyContent: "center" as const,
  width: BUTTON_SIZE,
};

function composerPlaceholder(isDark: boolean): string {
  return isDark ? "rgba(159, 159, 169, 0.55)" : "rgba(113, 113, 123, 0.55)";
}

function composerShellFill(isDark: boolean): string {
  return isDark ? "rgba(250, 250, 250, 0.04)" : "rgba(9, 9, 11, 0.04)";
}

function composerShellBorder(isDark: boolean): string {
  return isDark ? "rgba(250, 250, 250, 0.1)" : "rgba(9, 9, 11, 0.1)";
}

function ContextRing({ isDark, percent }: { isDark: boolean; percent: number }) {
  const dash = contextRingDash(percent);
  const progress =
    contextWindowBarTone(percent) === "warning"
      ? contextBarWarning(isDark)
      : chatForeground(isDark);
  return (
    <Svg height={CONTEXT_RING_SIZE} viewBox="0 0 16 16" width={CONTEXT_RING_SIZE}>
      <Circle
        cx={8}
        cy={8}
        fill="none"
        r={CONTEXT_RING_RADIUS}
        stroke={contextRingTrack(isDark)}
        strokeWidth={CONTEXT_RING_STROKE}
      />
      <Circle
        cx={8}
        cy={8}
        fill="none"
        origin="8, 8"
        r={CONTEXT_RING_RADIUS}
        rotation={-90}
        stroke={progress}
        strokeDasharray={dash.circumference}
        strokeDashoffset={dash.offset}
        strokeLinecap="round"
        strokeWidth={CONTEXT_RING_STROKE}
      />
    </Svg>
  );
}

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
  /**
   * Capture pin only. Omitted on the live composer so this effect does not
   * blur a field the user is typing in.
   */
  autoFocus?: boolean;
}): ReactElement {
  const theme = useMobileTheme();
  const textRef = useRef(props.text);
  const inputRef = useRef<TextInput>(null);
  const chipsRef = useRef<readonly ComposerPasteChip[]>(props.pasteChips ?? []);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
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
  const contextStats = contextUsageStats(props.sessionUsage);
  const contextLabel = contextTriggerLabel(props.sessionUsage);
  const showContext = contextLabel != null && props.onOpenCard != null;
  const contextA11y =
    contextLabel == null || contextLabel === copy.context
      ? copy.context
      : `${copy.context} ${contextLabel}`;

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

  useEffect(() => {
    if (props.autoFocus == null) return;
    if (props.autoFocus) inputRef.current?.focus();
    else inputRef.current?.blur();
  }, [props.autoFocus]);

  const renderPlus = () => (
    <GlassPanel interactive shadow={false} style={glassButton}>
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
        <View style={{ opacity: COMPOSER_GLYPH_OPACITY }}>
          <PlusIcon color={chatForeground(theme.isDark)} size={16} strokeWidth={2} />
        </View>
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
          borderRadius: BUTTON_SIZE / 2,
          height: BUTTON_SIZE,
          justifyContent: "center",
          opacity: !props.busy && !canSend ? 0.45 : pressed && !sendReady ? 0.6 : 1,
          width: BUTTON_SIZE,
        })}
      >
        <View style={{ opacity: props.busy || sendReady ? COMPOSER_GLYPH_OPACITY : 1 }}>
          {props.busy ? (
            <SquareIcon color={sendIcon} fill={sendIcon} size={12} strokeWidth={2} />
          ) : (
            <ArrowUpIcon color={sendIcon} size={16} strokeWidth={2} />
          )}
        </View>
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
      <Text style={{ color: chatMutedForeground(theme.isDark), fontSize: 12, lineHeight: 16 }}>
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
        gap: 6,
        height: BUTTON_SIZE,
        maxWidth: 352,
        opacity: pressed ? 0.6 : 1,
        paddingHorizontal: 8,
      })}
    >
      <View style={{ alignItems: "center", height: 16, justifyContent: "center", width: 16 }}>
        <MobileAgentIcon
          agentId={props.picker.agentId}
          iconUrl={props.picker.agentIconUrl}
          size={14}
        />
      </View>
      <Text
        numberOfLines={1}
        style={{
          color: chatMutedForeground(theme.isDark),
          flexShrink: 1,
          fontSize: 12,
          lineHeight: 16,
        }}
      >
        {modelLabel}
      </Text>
    </Pressable>
  );

  const renderContext = () =>
    showContext ? (
      <Pressable
        accessibilityLabel={contextA11y}
        accessibilityRole="button"
        onPress={() => props.onOpenCard?.("context")}
        style={({ pressed }) => ({
          alignItems: "center",
          borderRadius: 999,
          flexDirection: "row",
          flexShrink: 0,
          gap: 6,
          height: BUTTON_SIZE,
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
          paddingHorizontal: 8,
        })}
      >
        {contextStats ? <ContextRing isDark={theme.isDark} percent={contextStats.percent} /> : null}
        <Text
          numberOfLines={1}
          style={{
            color: chatMutedForeground(theme.isDark),
            fontSize: 11,
            fontVariant: ["tabular-nums"],
            fontWeight: "500",
            lineHeight: 14,
          }}
        >
          {contextLabel}
        </Text>
      </Pressable>
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
                shadow={false}
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
      <View
        style={{
          backgroundColor: composerShellFill(theme.isDark),
          borderColor: composerShellBorder(theme.isDark),
          borderCurve: "continuous",
          borderRadius: SHELL_RADIUS,
          borderWidth: 1,
          overflow: "hidden",
          width: "100%",
        }}
      >
        <View
          style={{
            overflow: "hidden",
            paddingBottom: 4,
            paddingHorizontal: 16,
            paddingTop: 14,
          }}
        >
          <TextInput
            ref={inputRef}
            multiline
            onChangeText={onDraftChange}
            onContentSizeChange={(event) => {
              if (props.text.length === 0) {
                setContentHeight(LINE_HEIGHT);
                return;
              }
              const next = Math.ceil(event.nativeEvent.contentSize.height);
              setContentHeight((current) => (Math.abs(current - next) < 2 ? current : next));
            }}
            placeholder={props.placeholder}
            placeholderTextColor={composerPlaceholder(theme.isDark)}
            scrollEnabled={contentHeight > LINE_HEIGHT * MAX_LINES}
            style={{
              color: chatForeground(theme.isDark),
              fontSize: FIELD_FONT_SIZE,
              lineHeight: LINE_HEIGHT,
              margin: 0,
              maxHeight: LINE_HEIGHT * MAX_LINES,
              minHeight: LINE_HEIGHT,
              padding: 0,
              textAlignVertical: "top",
              width: "100%",
            }}
            value={props.text}
          />
        </View>
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            gap: 4,
            minHeight: BUTTON_SIZE,
            paddingBottom: 8,
            paddingHorizontal: 8,
          }}
        >
          {renderPlus()}
          {showModel ? renderModel() : null}
          {showNoAgent ? (
            <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12, lineHeight: 16 }}>
              {copy.noAgent}
            </Text>
          ) : null}
          <View style={{ flex: 1 }} />
          {renderContext()}
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
