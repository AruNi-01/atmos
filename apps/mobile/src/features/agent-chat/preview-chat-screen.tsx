import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { parityFixtureById } from "@/features/agent-chat/parity-tree";
import { useThemeStore } from "@/theme/theme-store";
import { AgentChatComposer } from "./AgentChatComposer";
import { AgentChatTranscript, type AgentChatTranscriptHandle } from "./AgentChatTranscript";
import { cardPillTitle } from "./composer-cards";
import { ComposerPillRow } from "./composer-pill-row";
import { pillShowsAttention, reduceLane, type LaneState } from "./card-lane";
import { ExpandedCard } from "./cards/expanded-card";
import { LaneCardBody } from "./cards/lane-body";
import { copy } from "./copy";
import { buildComposerPicker, type FavoriteModel } from "./model-picker";
import { composerCardsFromParity, parityPreviewLane } from "./parity-composer-cards";
import {
  armParityClock,
  claimParityReady,
  parityClockIndex,
  parityCycleFrames,
  parityPinnedFrame,
  parityReadyLine,
  subscribeParityClock,
  type ParityFrame,
} from "./parity-cycle";
import { readParityDiskFrame } from "./read-parity-disk-frame";
import { resolvedPillRowHeight } from "./transcript-pad";
import { agentChatProcessExpandKey, useAgentChatExpandStore } from "./expand-store";
import {
  PARITY_MOTION_ROW_MS,
  PARITY_SETTLED_ASSISTANT_ID,
  PARITY_TAIL_MARKER_ID,
  parityMotionKind,
  paritySettledToolMessages,
  parityStreamToolMessages,
  parityTailLine,
  parityTailMessages,
} from "./parity-motion-fixtures";

const NO_FAVORITES: FavoriteModel[] = [];

function useParityClock(active: boolean): number {
  const [step, setStep] = useState(0);
  const [armed, setArmed] = useState(active);
  if (armed !== active) {
    setArmed(active);
    setStep(0);
  }
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setStep((current) => current + 1);
    }, PARITY_MOTION_ROW_MS);
    return () => clearInterval(timer);
  }, [active]);
  return step;
}

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
    scroll?: string | string[];
    theme?: string | string[];
  }>();
  const fixtureParam = param(params.fixture);
  const scrollParam = param(params.scroll);
  const themeParam = param(params.theme);
  const queryPin = useMemo(
    () => parityPinnedFrame(fixtureParam, themeParam),
    [fixtureParam, themeParam],
  );
  const [diskFrame] = useState<ParityFrame | null>(() => {
    if (queryPin) return null;
    const next = readParityDiskFrame();
    console.error(
      next
        ? `[parity] disk ${next.id} ${next.theme}${next.scroll === "away" ? " away" : ""}`
        : "[parity] disk none",
    );
    return next;
  });
  const pinned = queryPin ?? diskFrame;
  const frames = useMemo(() => parityCycleFrames(), []);
  const [index, setIndex] = useState(() => parityClockIndex());
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
  const transcriptRef = useRef<AgentChatTranscriptHandle>(null);
  const [stick, setStick] = useState({ belowCount: 0, stickToEnd: true });
  const stickTopRef = useRef(0);
  const stickEndRef = useRef(0);
  const onStickChange = useCallback(
    (next: {
      belowCount: number;
      distanceFromEnd?: number;
      stickToEnd: boolean;
      scrollTop?: number;
    }) => {
      if (typeof next.scrollTop === "number") stickTopRef.current = next.scrollTop;
      if (typeof next.distanceFromEnd === "number") stickEndRef.current = next.distanceFromEnd;
      setStick((current) =>
        current.belowCount === next.belowCount && current.stickToEnd === next.stickToEnd
          ? current
          : { belowCount: next.belowCount, stickToEnd: next.stickToEnd },
      );
    },
    [],
  );

  useEffect(() => subscribeParityClock(setIndex), []);

  useLayoutEffect(() => {
    if (preference !== frame.theme) setPreference(frame.theme);
  }, [frame.theme, preference, setPreference]);

  useEffect(() => {
    if (preference !== frame.theme) return;
    const token = `${frame.id}:${frame.theme}:${pinned ? "pin" : index}`;
    if (!claimParityReady(token)) return;
    console.error(parityReadyLine(frame, pinned ? 0 : index));
    if (pinned || index >= frames.length - 1) return;
    armParityClock(frames.length);
  }, [frame, frames.length, index, pinned, preference]);

  const motion = parityMotionKind(frame.id);
  const streamStep = useParityClock(motion === "stream");
  const tailStep = useParityClock(motion === "tail");
  const streamMessages = useMemo(() => parityStreamToolMessages(streamStep), [streamStep]);
  const tailMessages = useMemo(
    () => (motion === "tail" ? parityTailMessages(tailStep) : []),
    [motion, tailStep],
  );
  const fixture = motion ? null : parityFixtureById(frame.id);
  const cards = composerCardsFromParity(fixture?.cards);

  useLayoutEffect(() => {
    if (motion !== "settled") return;
    const store = useAgentChatExpandStore.getState();
    store.reset();
    store.setExpand(agentChatProcessExpandKey(PARITY_SETTLED_ASSISTANT_ID), true);
  }, [motion]);
  const laneKey = `${frame.id}:${frame.theme}`;
  const lane = choiceKey === laneKey && laneChoice ? laneChoice : parityPreviewLane(cards);
  const liveTail = motion === "tail";
  const scrollAway = liveTail && (scrollParam === "away" || pinned?.scroll === "away");
  useEffect(() => {
    if (!scrollAway) return;
    const started = Date.now();
    const timer = setInterval(() => {
      transcriptRef.current?.revealMessage(PARITY_TAIL_MARKER_ID);
      if (Date.now() - started >= 2000) clearInterval(timer);
    }, 250);
    transcriptRef.current?.revealMessage(PARITY_TAIL_MARKER_ID);
    return () => clearInterval(timer);
  }, [scrollAway]);
  useEffect(() => {
    if (!liveTail) return;
    console.error(
      parityTailLine({
        below: stick.belowCount,
        end: stickEndRef.current,
        stick: stick.stickToEnd,
        step: tailStep,
        top: stickTopRef.current,
      }),
    );
  }, [liveTail, stick.belowCount, stick.stickToEnd, tailStep]);
  const messages = (
    motion === "stream"
      ? streamMessages
      : liveTail
        ? tailMessages
        : motion === "settled"
          ? paritySettledToolMessages()
          : (fixture?.messages ?? [])
  ) as AgentMessage[];
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
  const insets = useSafeAreaInsets();
  const backgroundColor = theme === "dark" ? "#000000" : "#f4f4f6";
  const color = theme === "dark" ? "#f4f4f6" : "#1a1a1a";

  const onPillPress = (id: (typeof cards.available)[number]) => {
    setChoiceKey(laneKey);
    setLaneChoice(reduceLane(lane, { type: "pill_tapped", id }));
  };

  return (
    <View style={{ backgroundColor, flex: 1, paddingTop: insets.top }} testID="parity-ready">
      <View style={{ flex: 1 }}>
        {fixture || motion ? (
          <AgentChatTranscript
            key={laneKey}
            ref={transcriptRef}
            expandedCardHeight={lane.visible ? cardHeight : 0}
            messages={messages}
            onStickChange={liveTail ? onStickChange : undefined}
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
          belowCount={liveTail ? stick.belowCount : 0}
          messageCount={messages.length}
          onLayout={(event) => setPillHeight(event.nativeEvent.layout.height)}
          onPillPress={onPillPress}
          onScrollToBottom={() => transcriptRef.current?.scrollToEndAnimated()}
          pills={pills}
          stickToEnd={liveTail ? stick.stickToEnd : true}
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
