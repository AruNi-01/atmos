import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { parityFixtureById } from "@/features/agent-chat/parity-tree";
import { useThemeStore } from "@/theme/theme-store";
import { AgentChatComposer } from "./AgentChatComposer";
import { AgentChatTranscript } from "./AgentChatTranscript";
import { cardPillTitle } from "./composer-cards";
import { ComposerPillRow } from "./composer-pill-row";
import { pillShowsAttention, reduceLane, type LaneState } from "./card-lane";
import { ExpandedCard } from "./cards/expanded-card";
import { LaneCardBody } from "./cards/lane-body";
import { copy } from "./copy";
import { buildComposerPicker, type FavoriteModel } from "./model-picker";
import { composerCardsFromParity, parityPreviewLane } from "./parity-composer-cards";
import {
  PARITY_HOLD_MS,
  parityCycleFrames,
  parityPinnedFrame,
  parityReadyLine,
  type ParityFrame,
} from "./parity-cycle";
import { resolvedPillRowHeight } from "./transcript-pad";

const NO_FAVORITES: FavoriteModel[] = [];

function param(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ?? "";
}

async function noopAsync(): Promise<void> {
  return undefined;
}

export function PreviewChatScreen() {
  const params = useLocalSearchParams<{
    fixture?: string | string[];
    theme?: string | string[];
  }>();
  const fixtureParam = param(params.fixture);
  const themeParam = param(params.theme);
  const pinned = useMemo(
    () => parityPinnedFrame(fixtureParam, themeParam),
    [fixtureParam, themeParam],
  );
  const frames = useMemo(() => parityCycleFrames(), []);
  const [index, setIndex] = useState(0);
  const frame = useMemo<ParityFrame>(
    () => pinned ?? frames[index] ?? { id: "F1", theme: "light" },
    [frames, index, pinned],
  );
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const [laneChoice, setLaneChoice] = useState<LaneState | null>(null);
  const [choiceKey, setChoiceKey] = useState("");
  const [cardHeight, setCardHeight] = useState(0);
  const [pillHeight, setPillHeight] = useState(0);
  const [text, setText] = useState("");
  const logged = useRef("");

  useLayoutEffect(() => {
    if (preference !== frame.theme) setPreference(frame.theme);
  }, [frame.theme, preference, setPreference]);

  useEffect(() => {
    if (preference !== frame.theme) return;
    const token = `${frame.id}:${frame.theme}:${pinned ? "pin" : index}`;
    if (logged.current === token) return;
    logged.current = token;
    console.error(parityReadyLine(frame, pinned ? 0 : index));
    if (pinned || index >= frames.length - 1) return;
    const timer = setTimeout(() => setIndex((current) => current + 1), PARITY_HOLD_MS);
    return () => clearTimeout(timer);
  }, [frame, frames.length, index, pinned, preference]);

  const fixture = parityFixtureById(frame.id);
  const cards = composerCardsFromParity(fixture?.cards);
  const laneKey = `${frame.id}:${frame.theme}`;
  const lane = choiceKey === laneKey && laneChoice ? laneChoice : parityPreviewLane(cards);
  const messages = (fixture?.messages ?? []) as AgentMessage[];
  const pills = cards.available.map((id) => ({
    id,
    title: cardPillTitle(id, {
      permission: cards.permission,
      goal: cards.goal,
      workflow: cards.workflow,
    }),
    selected: lane.visible === id,
    attention: pillShowsAttention(id, lane.visible),
  }));
  const pillRowHeight = resolvedPillRowHeight(pills.length > 0, pillHeight);
  const picker = useMemo(
    () =>
      buildComposerPicker({
        agents: [],
        agentId: null,
        options: null,
        modelId: null,
        thinkingId: null,
        modeId: null,
        permissionId: null,
        fastId: null,
        contextId: null,
      }),
    [],
  );
  const theme = frame.theme;
  const backgroundColor = theme === "dark" ? "#000000" : "#f4f4f6";
  const color = theme === "dark" ? "#f4f4f6" : "#1a1a1a";

  const onPillPress = (id: (typeof cards.available)[number]) => {
    setChoiceKey(laneKey);
    setLaneChoice(reduceLane(lane, { type: "pill_tapped", id }));
  };

  return (
    <View style={{ backgroundColor, flex: 1 }} testID="parity-ready">
      <View style={{ flex: 1 }}>
        {fixture ? (
          <AgentChatTranscript
            key={laneKey}
            expandedCardHeight={lane.visible ? cardHeight : 0}
            messages={messages}
            pillRowHeight={pillRowHeight}
          />
        ) : (
          <Text style={{ color, fontSize: 15, paddingHorizontal: 16 }}>Missing fixture</Text>
        )}
      </View>
      <View style={{ gap: 8, paddingBottom: 12, paddingTop: 8 }}>
        {lane.visible ? (
          <ExpandedCard key={lane.visible} onHeight={setCardHeight}>
            <LaneCardBody
              cards={cards}
              onQueueDelete={noopAsync}
              onQueueReorder={noopAsync}
              onQueueUpdate={noopAsync}
              onRespondPermission={() => undefined}
              onRespondSessionOp={() => undefined}
              visible={lane.visible}
            />
          </ExpandedCard>
        ) : null}
        <ComposerPillRow
          belowCount={0}
          messageCount={messages.length}
          onLayout={(event) => setPillHeight(event.nativeEvent.layout.height)}
          onPillPress={onPillPress}
          onScrollToBottom={() => undefined}
          pills={pills}
          stickToEnd
        />
        <View style={{ paddingHorizontal: 18 }}>
          <AgentChatComposer
            busy={false}
            favorites={NO_FAVORITES}
            onChangeText={setText}
            onOpenCard={cards.context ? () => onPillPress("context") : undefined}
            onPatch={() => undefined}
            onPhotosChange={() => undefined}
            onQueue={() => undefined}
            onRemovePhoto={() => undefined}
            onSend={() => undefined}
            onSteer={() => undefined}
            onStop={() => undefined}
            onToggleFavorite={() => undefined}
            photos={[]}
            picker={picker}
            placeholder={copy.placeholder}
            queueLabel={copy.queue}
            sendLabel={copy.send}
            sessionUsage={
              cards.context
                ? { used: cards.context.used, context_window: cards.context.context_window }
                : null
            }
            steerLabel={copy.steer}
            stopLabel={copy.stop}
            text={text}
          />
        </View>
      </View>
    </View>
  );
}
