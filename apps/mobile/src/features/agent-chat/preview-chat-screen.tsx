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
import { cardPillTitle, laneCardDrawsOwnFrame } from "./composer-cards";
import { ComposerPillRow } from "./composer-pill-row";
import { pillShowsAttention, reduceLane, type LaneState } from "./card-lane";
import { ExpandedCard } from "./cards/expanded-card";
import { LaneCardBody } from "./cards/lane-body";
import { copy } from "./copy";
import { userMessageOutsidePressCapture } from "./user-message-outside";
import { pushParityReducedMotion } from "./motion/parity-reduced-motion";
import { ParityTextSweepContext } from "./motion/text-shimmer";
import { buildComposerPicker, type FavoriteModel } from "./model-picker";
import { composerCardsFromParity, parityPreviewLane } from "./parity-composer-cards";
import {
  parityComposerShotName,
  parityComposerStepAt,
  parityComposerSteps,
  type ParityComposerStep,
} from "./parity-composer-states";
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
import {
  foldParityReplay,
  parityDrawHoldProgress,
  parityReplaySeed,
  parityReplayShotTimes,
} from "./parity-replay";
import { ParityDrawHoldContext } from "./parity-draw-hold";
import { readParityDiskFrame } from "./read-parity-disk-frame";
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
    composer?: string | string[];
    fixture?: string | string[];
    motion?: string | string[];
    lane?: string | string[];
    pill?: string | string[];
    replay?: string | string[];
    scroll?: string | string[];
    theme?: string | string[];
  }>();
  const composerParam = param(params.composer);
  const fixtureParam = param(params.fixture);
  const laneParam = param(params.lane);
  const motionParam = param(params.motion);
  const pillParam = param(params.pill);
  const replayParam = param(params.replay);
  const scrollParam = param(params.scroll);
  const themeParam = param(params.theme);
  const queryPin = useMemo(
    () =>
      parityPinnedFrame(
        fixtureParam,
        themeParam,
        motionParam,
        replayParam,
        laneParam,
        pillParam,
        composerParam,
      ),
    [composerParam, fixtureParam, laneParam, motionParam, pillParam, replayParam, themeParam],
  );
  const [diskFrame] = useState<ParityFrame | null>(() => {
    if (queryPin) return null;
    const next = readParityDiskFrame();
    console.error(
      next
        ? `[parity] disk ${next.id} ${next.theme}${next.scroll === "away" ? " away" : ""}${next.motion === "reduced" ? " reduced" : ""}${next.replay === "script" ? " replay" : ""}${next.lane === "steps" ? " lane" : ""}${next.pill === "return" ? " pill" : ""}${next.composer === "states" ? " composer" : ""}`
        : "[parity] disk none",
    );
    return next;
  });
  const [heldAtMs, setHeldAtMs] = useState<number | null>(() => diskFrame?.atMs ?? null);
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
  const [composerStep, setComposerStep] = useState<ParityComposerStep>(() => {
    const first = parityComposerSteps()[0];
    if (!first) throw new Error("composer capture steps are empty");
    return first;
  });
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
  const tailAwaitLoggedRef = useRef(false);
  const tailStepRef = useRef(0);
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

  useEffect(() => {
    if (diskFrame?.atMs == null) return;
    const timer = setInterval(() => {
      const next = readParityDiskFrame({ quiet: true });
      // A missing read keeps the freeze. The capture starts the recorder on
      // the held frame, then rewrites the pin without atMs. That parsed pin
      // is what starts the clock while recording.
      if (!next) return;
      if (next.atMs == null) {
        setHeldAtMs(null);
        return;
      }
      setHeldAtMs((current) => (current === next.atMs ? current : (next.atMs ?? null)));
    }, 250);
    return () => clearInterval(timer);
  }, [diskFrame?.atMs]);

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
  const liveTail = motion === "tail";
  const replayOn = frame.replay === "script" && Boolean(fixture?.script?.length);
  const laneStepsOn = frame.lane === "steps" && cards.available.length > 0;
  const composerStatesOn = frame.composer === "states";
  const laneStepKey = laneStepsOn ? `${frame.id}:${cards.available.join(",")}` : "";
  const replayKey = replayOn ? `${frame.id}:${frame.motion ?? ""}:${frame.theme}` : "";
  const [replayClock, setReplayClock] = useState({ elapsed: 0, key: replayKey });
  if (replayClock.key !== replayKey) setReplayClock({ elapsed: 0, key: replayKey });
  const holdOn = heldAtMs != null;
  const replayElapsed = heldAtMs ?? (replayClock.key === replayKey ? replayClock.elapsed : 0);
  const scrollAway = liveTail && (scrollParam === "away" || pinned?.scroll === "away");
  const pillReturn = scrollAway && frame.pill === "return";
  const ownsTail = parityTailOwned(focused, tailMountId, tailOwner);
  const ownsReplay = replayOn && ownsTail;
  const ownsLane = laneStepsOn && ownsTail;
  const ownsComposer = composerStatesOn && ownsTail;
  const heldLaneShot = useMemo(() => {
    if (!holdOn || heldAtMs == null || !laneStepsOn) return null;
    const initial = parityPreviewLane(cards);
    const shots = parityLaneShots(initial, parityLaneSampleTaps(cards.available, initial.visible));
    return [...shots].reverse().find((item) => heldAtMs >= item.atMs) ?? shots[0] ?? null;
  }, [cards, heldAtMs, holdOn, laneStepsOn]);
  const lane =
    heldLaneShot?.state ??
    (choiceKey === laneKey && laneChoice ? laneChoice : parityPreviewLane(cards));
  const heldComposerStep =
    holdOn && composerStatesOn && heldAtMs != null ? parityComposerStepAt(heldAtMs) : null;
  const heldComposerAt = heldComposerStep?.atMs ?? null;
  const composerShown = heldComposerStep ?? composerStep;
  useLayoutEffect(() => {
    if (!focused || (!liveTail && !replayOn && !laneStepsOn && !composerStatesOn)) return;
    const generation = takeParityOwner();
    bindParityTailMount(tailMountId, generation);
    console.error(`[parity] tail owner ${generation}`);
    return () => {
      bindParityTailMount(tailMountId, 0);
      releaseParityOwner(generation);
    };
  }, [composerStatesOn, focused, laneStepsOn, liveTail, replayOn, tailMountId]);
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
    tailStepRef.current = tailStep;
  }, [tailStep]);
  const logTailReturned = useCallback((sample: ParityTailSample) => {
    if (tailReturnLoggedRef.current) return;
    tailReturnLoggedRef.current = true;
    const below = sample.below;
    const end = Math.round(sample.end);
    const top = Math.round(sample.top);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void writeParityMotionPng(previewRootRef, "tail-back").finally(() => {
          console.error(`[parity] tail returned below=${below} stick=1 end=${end} top=${top}`);
        });
      });
    });
  }, []);
  const onViewport = useCallback(
    (next: {
      belowCount: number;
      distanceFromEnd: number;
      stickToEnd: boolean;
      scrollTop: number;
      viewport: number;
    }) => {
      stickTopRef.current = next.scrollTop;
      stickEndRef.current = next.distanceFromEnd;
      stickViewRef.current = next.viewport;
      if (!tailReturnPressedRef.current || tailReturnLoggedRef.current) return;
      const marker = transcriptRef.current?.measureMessage(PARITY_TAIL_MARKER_ID);
      const sample: ParityTailSample = {
        below: next.belowCount,
        end: next.distanceFromEnd,
        marker: marker?.start ?? -1,
        stick: next.stickToEnd,
        step: tailStepRef.current,
        top: next.scrollTop,
        view: next.viewport,
      };
      if (parityTailReturnPhase([...tailSamplesRef.current, sample], true) !== "landed") return;
      tailSamplesRef.current.push(sample);
      logTailReturned(sample);
    },
    [logTailReturned],
  );
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
      if (tailAwaitLoggedRef.current) return;
      tailAwaitLoggedRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void writeParityMotionPng(previewRootRef, "tail-held").finally(() => {
            console.error("[parity] pill awaiting tap");
          });
        });
      });
      return;
    }
    if (phase !== "landed" || tailReturnLoggedRef.current) return;
    logTailReturned(sample);
  }, [
    liveTail,
    logTailReturned,
    ownsTail,
    pillReturn,
    stick.belowCount,
    stick.stickToEnd,
    tailStep,
  ]);
  useEffect(() => {
    if (!holdOn || !ownsReplay || !fixture?.script) return;
    console.error(`[parity] replay shots ${parityReplayShotTimes(fixture.script).join(" ")}`);
  }, [fixture, holdOn, ownsReplay]);
  useEffect(() => {
    if (!holdOn || !ownsReplay) return;
    console.error(`[parity] replay held ${heldAtMs}`);
  }, [heldAtMs, holdOn, ownsReplay]);
  useEffect(() => {
    if (!ownsReplay || !fixture?.script || holdOn) return;
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
        // A Skia snapshot of the live shimmer never returned (run 39036378433,
        // Atmos 47380). Reduced motion has no shimmer, and those files landed.
        if (frame.motion !== "reduced") continue;
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
        const pass = frame.motion === "reduced" ? "reduced" : "live";
        console.error(`[parity] replay done ${pass} ${shots.length}`);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [fixture, frame.motion, holdOn, ownsReplay, replayKey]);
  useEffect(() => {
    if (!holdOn || !ownsLane) return;
    const initial = parityPreviewLane(cards);
    const shots = parityLaneShots(initial, parityLaneSampleTaps(cards.available, initial.visible));
    console.error(`[parity] lane shots ${shots.map((shot) => shot.atMs).join(" ")}`);
  }, [cards, holdOn, ownsLane]);
  useEffect(() => {
    if (!heldLaneShot || !ownsLane) return;
    console.error(`[parity] lane held ${heldLaneShot.atMs}`);
  }, [heldLaneShot, ownsLane]);
  useEffect(() => {
    if (!ownsLane || holdOn) return;
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
  }, [cards, holdOn, laneKey, laneStepKey, ownsLane]);
  useEffect(() => {
    if (!holdOn || !ownsComposer) return;
    console.error(
      `[parity] composer shots ${parityComposerSteps()
        .map((step) => step.atMs)
        .join(" ")}`,
    );
  }, [holdOn, ownsComposer]);
  useEffect(() => {
    if (heldComposerAt == null || !ownsComposer) return;
    console.error(`[parity] composer held ${heldComposerAt}`);
  }, [heldComposerAt, ownsComposer]);
  useEffect(() => {
    if (!ownsComposer || holdOn) return;
    const steps = parityComposerSteps();
    const started = Date.now();
    const taken = new Set<string>();
    console.error(`[parity] composer start ${steps.length}`);
    const timer = setInterval(() => {
      const elapsed = Date.now() - started;
      for (const step of steps) {
        if (elapsed < step.atMs || taken.has(step.id)) continue;
        taken.add(step.id);
        setComposerStep((current) => (current.id === step.id ? current : step));
      }
      const last = steps[steps.length - 1];
      if (last && elapsed >= last.atMs) {
        clearInterval(timer);
        console.error(`[parity] composer done ${steps.length}`);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [holdOn, ownsComposer]);
  useEffect(() => {
    if (!ownsComposer) return;
    const name = parityComposerShotName(composerShown.id);
    const frameId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void writeParityMotionPng(previewRootRef, name);
      });
    });
    return () => cancelAnimationFrame(frameId);
  }, [composerShown.id, ownsComposer]);
  const composerDriven = ownsComposer;
  const drawHold =
    holdOn && fixture?.script ? parityDrawHoldProgress(fixture.script, heldAtMs ?? 0) : null;
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
  const pillRowHeight = pillHeight;
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

  const parityTextSweep = Boolean(ownsReplay && frame.motion !== "reduced" && !holdOn);
  return (
    <ParityTextSweepContext.Provider value={parityTextSweep}>
      <View
        collapsable={false}
        {...userMessageOutsidePressCapture()}
        ref={previewRootRef}
        style={{ backgroundColor, flex: 1, paddingTop: insets.top }}
        testID="parity-ready"
      >
        <View style={{ flex: 1 }}>
          {fixture || motion ? (
            <ParityDrawHoldContext.Provider value={drawHold}>
              <AgentChatTranscript
                key={laneKey}
                ref={transcriptRef}
                expandedCardHeight={lane.visible ? cardHeight : 0}
                messages={messages}
                onStickChange={liveTail ? onStickChange : undefined}
                onViewport={pillReturn ? onViewport : undefined}
                pillRowHeight={pillRowHeight}
              />
            </ParityDrawHoldContext.Provider>
          ) : (
            <Text style={{ color, fontSize: 15, paddingHorizontal: 16 }}>Missing fixture</Text>
          )}
        </View>
        <View style={{ gap: 8, paddingBottom: 12, paddingTop: 8 }}>
          {lane.visible ? (
            <ExpandedCard
              bare={laneCardDrawsOwnFrame(lane.visible, cards)}
              key={lane.visible}
              onHeight={setCardHeight}
            >
              <LaneCardBody
                cards={cards}
                messages={messages}
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
            onScrollToBottom={() => {
              if (pillReturn) {
                tailReturnPressedRef.current = true;
                console.error("[parity] scroll pill press");
              }
              transcriptRef.current?.scrollToEndAnimated();
            }}
            pills={pills}
            stickToEnd={liveTail ? stick.stickToEnd : true}
          />
          <View style={{ paddingHorizontal: 18 }}>
            <AgentChatComposer
              autoFocus={composerDriven ? composerShown.focus : undefined}
              busy={composerDriven ? composerShown.busy : false}
              favorites={NO_FAVORITES}
              followUp={composerDriven ? composerShown.followUp : undefined}
              onChangeText={composerDriven ? () => undefined : setText}
              onOpenCard={cards.context ? () => onPillPress("context") : undefined}
              onPatch={() => undefined}
              onPhotosChange={() => undefined}
              onPickSuggestion={() => undefined}
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
              suggestionTitle={composerDriven ? composerShown.suggestionTitle : undefined}
              suggestions={composerDriven ? (composerShown.suggestions ?? undefined) : undefined}
              text={composerDriven ? composerShown.text : text}
            />
          </View>
        </View>
      </View>
    </ParityTextSweepContext.Provider>
  );
}
