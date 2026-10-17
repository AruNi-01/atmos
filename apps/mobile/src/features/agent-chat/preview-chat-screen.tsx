import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Text, View, type View as PreviewRoot } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused, useLocalSearchParams } from "expo-router";
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
import { pushParityReducedMotion } from "./motion/parity-reduced-motion";
import { buildComposerPicker, type FavoriteModel } from "./model-picker";
import { composerCardsFromParity, parityPreviewLane } from "./parity-composer-cards";
import {
  armParityClock,
  bindParityTailMount,
  claimParityReady,
  parityClockIndex,
  parityCycleFrames,
  parityOwnerIs,
  parityPinnedFrame,
  parityReadyLine,
  parityTailOwned,
  parityTailSnapshot,
  releaseParityOwner,
  subscribeParityClock,
  subscribeParityOwner,
  takeParityOwner,
  type ParityFrame,
} from "./parity-cycle";
import { writeParityMotionPng } from "./capture-parity-view";
import { parityLaneSampleTaps, parityLaneShots } from "./parity-lane-steps";
import { foldParityReplay, parityReplaySeed, parityReplayShotTimes } from "./parity-replay";
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
  parityTailReturnPhase,
  type ParityTailSample,
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
    motion?: string | string[];
    lane?: string | string[];
    pill?: string | string[];
    replay?: string | string[];
    scroll?: string | string[];
    theme?: string | string[];
  }>();
  const fixtureParam = param(params.fixture);
  const laneParam = param(params.lane);
  const motionParam = param(params.motion);
  const pillParam = param(params.pill);
  const replayParam = param(params.replay);
  const scrollParam = param(params.scroll);
  const themeParam = param(params.theme);
  const queryPin = useMemo(
    () =>
      parityPinnedFrame(fixtureParam, themeParam, motionParam, replayParam, laneParam, pillParam),
    [fixtureParam, laneParam, motionParam, pillParam, replayParam, themeParam],
  );
  const [diskFrame] = useState<ParityFrame | null>(() => {
    if (queryPin) return null;
    const next = readParityDiskFrame();
    console.error(
      next
        ? `[parity] disk ${next.id} ${next.theme}${next.scroll === "away" ? " away" : ""}${next.motion === "reduced" ? " reduced" : ""}${next.replay === "script" ? " replay" : ""}${next.lane === "steps" ? " lane" : ""}${next.pill === "return" ? " pill" : ""}`
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
  const previewRootRef = useRef<PreviewRoot | null>(null);
  const [reducedRelease] = useState<(() => void) | null>(() => {
    if (frame.motion !== "reduced") return null;
    console.error("[parity] motion reduced");
    return pushParityReducedMotion({ notify: false });
  });
  const tailMountId = useId();
  const tailOwner = useSyncExternalStore(
    subscribeParityOwner,
    parityTailSnapshot,
    parityTailSnapshot,
  );
  const focused = useIsFocused();
  const [stick, setStick] = useState({ belowCount: 0, stickToEnd: true });
  const stickTopRef = useRef(0);
  const stickEndRef = useRef(0);
  const stickViewRef = useRef(0);
  const tailSamplesRef = useRef<ParityTailSample[]>([]);
  const tailReturnPressedRef = useRef(false);
  const tailReturnLoggedRef = useRef(false);
  const onStickChange = useCallback(
    (next: {
      belowCount: number;
      distanceFromEnd?: number;
      stickToEnd: boolean;
      scrollTop?: number;
      viewport?: number;
    }) => {
      if (typeof next.scrollTop === "number") stickTopRef.current = next.scrollTop;
      if (typeof next.distanceFromEnd === "number") stickEndRef.current = next.distanceFromEnd;
      if (typeof next.viewport === "number") stickViewRef.current = next.viewport;
      setStick((current) =>
        current.belowCount === next.belowCount && current.stickToEnd === next.stickToEnd
          ? current
          : { belowCount: next.belowCount, stickToEnd: next.stickToEnd },
      );
    },
    [],
  );

  useEffect(() => subscribeParityClock(setIndex), []);

  useEffect(() => {
    return () => reducedRelease?.();
  }, [reducedRelease]);

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
  const cards = useMemo(() => composerCardsFromParity(fixture?.cards), [fixture?.cards]);

  useLayoutEffect(() => {
    if (motion !== "settled") return;
    const store = useAgentChatExpandStore.getState();
    store.reset();
    store.setExpand(agentChatProcessExpandKey(PARITY_SETTLED_ASSISTANT_ID), true);
  }, [motion]);
  const laneKey = `${frame.id}:${frame.theme}`;
  const lane = choiceKey === laneKey && laneChoice ? laneChoice : parityPreviewLane(cards);
  const liveTail = motion === "tail";
  const replayOn = frame.replay === "script" && Boolean(fixture?.script?.length);
  const laneStepsOn = frame.lane === "steps" && cards.available.length > 0;
  const laneStepKey = laneStepsOn ? `${frame.id}:${cards.available.join(",")}` : "";
  const replayKey = replayOn ? `${frame.id}:${frame.motion ?? ""}:${frame.theme}` : "";
  const [replayClock, setReplayClock] = useState({ elapsed: 0, key: replayKey });
  if (replayClock.key !== replayKey) setReplayClock({ elapsed: 0, key: replayKey });
  const replayElapsed = replayClock.key === replayKey ? replayClock.elapsed : 0;
  const scrollAway = liveTail && (scrollParam === "away" || pinned?.scroll === "away");
  const pillReturn = scrollAway && frame.pill === "return";
  const ownsTail = parityTailOwned(focused, tailMountId, tailOwner);
  const ownsReplay = replayOn && ownsTail;
  const ownsLane = laneStepsOn && ownsTail;
  useLayoutEffect(() => {
    if (!focused || (!liveTail && !replayOn && !laneStepsOn)) return;
    const generation = takeParityOwner();
    bindParityTailMount(tailMountId, generation);
    console.error(`[parity] tail owner ${generation}`);
    return () => {
      bindParityTailMount(tailMountId, 0);
      releaseParityOwner(generation);
    };
  }, [focused, laneStepsOn, liveTail, replayOn, tailMountId]);
  useEffect(() => {
    if (!scrollAway || !ownsTail) return;
    const generation = tailOwner.owner;
    const started = Date.now();
    const reveal = () => {
      if (!parityOwnerIs(generation)) return;
      transcriptRef.current?.revealMessage(PARITY_TAIL_MARKER_ID);
    };
    const timer = setInterval(() => {
      reveal();
      if (Date.now() - started >= 2000) clearInterval(timer);
    }, 250);
    reveal();
    return () => clearInterval(timer);
  }, [ownsTail, scrollAway, tailOwner.owner]);
  useEffect(() => {
    if (!liveTail || !ownsTail) return;
    const marker = transcriptRef.current?.measureMessage(PARITY_TAIL_MARKER_ID);
    const sample: ParityTailSample = {
      below: stick.belowCount,
      end: stickEndRef.current,
      marker: marker?.start ?? -1,
      stick: stick.stickToEnd,
      step: tailStep,
      top: stickTopRef.current,
      view: stickViewRef.current,
    };
    tailSamplesRef.current.push(sample);
    console.error(parityTailLine(sample));
    if (!pillReturn) return;
    const phase = parityTailReturnPhase(tailSamplesRef.current, tailReturnPressedRef.current);
    if (phase === "press") {
      tailReturnPressedRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void writeParityMotionPng(previewRootRef, "tail-held").finally(() => {
            transcriptRef.current?.scrollToEndAnimated();
          });
        });
      });
      return;
    }
    if (phase !== "landed" || tailReturnLoggedRef.current) return;
    tailReturnLoggedRef.current = true;
    void writeParityMotionPng(previewRootRef, "tail-back");
    console.error(
      `[parity] tail returned below=${sample.below} stick=1 end=${Math.round(sample.end)} top=${Math.round(sample.top)}`,
    );
  }, [liveTail, ownsTail, pillReturn, stick.belowCount, stick.stickToEnd, tailStep]);
  useEffect(() => {
    if (!ownsReplay || !fixture?.script) return;
    const shots = parityReplayShotTimes(fixture.script);
    const started = Date.now();
    const taken = new Set<number>();
    console.error(`[parity] replay start ${shots.length}`);
    const timer = setInterval(() => {
      const elapsed = Date.now() - started;
      setReplayClock((current) =>
        current.key === replayKey ? { elapsed, key: replayKey } : current,
      );
      for (const shot of shots) {
        if (elapsed < shot || taken.has(shot)) continue;
        taken.add(shot);
        const name = `f4-${String(shot).padStart(5, "0")}`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            void writeParityMotionPng(previewRootRef, name);
          });
        });
      }
      const last = shots[shots.length - 1] ?? 0;
      if (elapsed >= last) {
        clearInterval(timer);
        console.error(`[parity] replay done ${shots.length}`);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [fixture, ownsReplay, replayKey]);
  useEffect(() => {
    if (!ownsLane) return;
    const initial = parityPreviewLane(cards);
    const shots = parityLaneShots(initial, parityLaneSampleTaps(cards.available, initial.visible));
    if (shots.length < 2) return;
    const started = Date.now();
    const taken = new Set<number>();
    console.error(`[parity] lane start ${shots.length}`);
    const timer = setInterval(() => {
      const elapsed = Date.now() - started;
      for (const shot of shots) {
        if (elapsed < shot.atMs || taken.has(shot.atMs)) continue;
        taken.add(shot.atMs);
        setChoiceKey(laneKey);
        setLaneChoice(shot.state);
        const name = `lane-${String(shot.atMs).padStart(5, "0")}`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            void writeParityMotionPng(previewRootRef, name);
          });
        });
      }
      const last = shots[shots.length - 1]?.atMs ?? 0;
      if (elapsed >= last) {
        clearInterval(timer);
        console.error(`[parity] lane done ${shots.length}`);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [cards, laneKey, laneStepKey, ownsLane]);
  const replayMessages = useMemo(() => {
    if (!replayOn || !fixture?.script?.length) return null;
    return foldParityReplay(
      fixture.script[0]?.event.chat_id ?? frame.id,
      parityReplaySeed(fixture.messages),
      fixture.script,
      replayElapsed,
    );
  }, [fixture, frame.id, replayElapsed, replayOn]);
  const messages = (
    replayMessages
      ? replayMessages
      : motion === "stream"
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
    <View
      ref={previewRootRef}
      style={{ backgroundColor, flex: 1, paddingTop: insets.top }}
      testID="parity-ready"
    >
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
