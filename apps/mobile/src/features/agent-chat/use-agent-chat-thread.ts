import type { AgentChatPayload } from "@atmos/api-types/ws/dto/agent-chat";
import {
  AGENT_CHAT_COMMIT_FLUSH_MS,
  classifyCommitCadence,
  createAgentChatCommitBuffer,
  type AgentChatCommitBuffer,
} from "@atmos/agent-transcript";

/** Flush cadence, plus every event when reduced motion is on. */
export function shouldFlushAgentEvent(
  type: AgentChatPayload["type"],
  reducedMotion: boolean,
): boolean {
  return reducedMotion || classifyCommitCadence(type) === "flush";
}

/** Fold is applied by the caller. This only decides when that fold is painted. */
export function pushAgentChatCommit(
  buffer: AgentChatCommitBuffer,
  type: AgentChatPayload["type"],
  reducedMotion: boolean,
): void {
  const decision = buffer.deliver(type);
  if (shouldFlushAgentEvent(type, reducedMotion) && !decision.flushed) buffer.flush();
}

// @hook

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  createAgentChatEventPump,
  type AgentChatEventPump,
  type AgentChatPumpIngest,
  type BackfillRequest,
} from "@atmos/api-client/agent-chat";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { copy } from "./copy";
import { applyChatEvent, createChatTranscript, type ChatTranscriptState } from "./fold-transcript";
import { agentChatEventFromMessage, eventsForChat } from "./foreign-event";
import { nextAgentChatResyncDelayMs, shouldAbandonAgentChatHydrate } from "./hydrate-recovery";
import { useReducedMotion } from "./motion/use-reduced-motion";
import { canResumeAgentChatSession } from "./session-resume";

function backfillKey(request: BackfillRequest): string {
  return `${request.partId}:${request.fromOffset}`;
}

export function useAgentChatThread(chatId: string) {
  const reducedMotion = useReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  useLayoutEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);
  const { client, state: wsState } = useMobileWs();
  const [transcript, setTranscript] = useState<ChatTranscriptState>(() =>
    createChatTranscript(chatId),
  );
  const transcriptRef = useRef(transcript);
  const pumpRef = useRef<AgentChatEventPump | null>(null);
  const loadedChatRef = useRef<string | null>(null);
  const loadedClientRef = useRef<object | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (chatId.trim() === "") {
      return;
    }
    const isResume =
      pumpRef.current != null &&
      canResumeAgentChatSession({
        chatId,
        client,
        loadedChatId: loadedChatRef.current,
        loadedClient: loadedClientRef.current,
      });
    if (!client || wsState !== "open") {
      if (!isResume) {
        setLoading(false);
        setError("Atmos mobile WebSocket is not connected");
      }
      return;
    }

    let cancelled = false;
    let resyncing = false;
    let failedResyncs = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const inflight = new Set<string>();
    if (!isResume) {
      pumpRef.current = createAgentChatEventPump();
      loadedChatRef.current = null;
      loadedClientRef.current = null;
      const empty = createChatTranscript(chatId);
      transcriptRef.current = empty;
      setTranscript(empty);
      setLoading(true);
      setError(null);
    }
    const pump = pumpRef.current ?? createAgentChatEventPump();
    pumpRef.current = pump;

    const commitBuffer = createAgentChatCommitBuffer({
      flushMs: AGENT_CHAT_COMMIT_FLUSH_MS,
      now: () => Date.now(),
      onCommit: () => {
        if (cancelled) return;
        setTranscript(transcriptRef.current);
      },
    });
    const flushTimer = setInterval(() => {
      commitBuffer.maybeFlush();
    }, AGENT_CHAT_COMMIT_FLUSH_MS);

    const requestBackfill = (request: BackfillRequest) => {
      const key = backfillKey(request);
      if (inflight.has(key)) return;
      inflight.add(key);
      void wsActions
        .agentChatBackfill(client, {
          chat_id: chatId,
          parts: [{ part_id: request.partId, from_offset: request.fromOffset }],
        })
        .catch(() => {
          if (!cancelled) setError("Could not catch up this chat.");
        })
        .finally(() => {
          inflight.delete(key);
        });
    };

    const applyDecision = (decision: AgentChatPumpIngest) => {
      if (decision.action !== "apply") return;
      const next = applyChatEvent(transcriptRef.current, decision.event);
      transcriptRef.current = next.state;
      if (next.backfill) requestBackfill(next.backfill);
      pushAgentChatCommit(commitBuffer, decision.event.payload.type, reducedMotionRef.current);
    };

    const applySnapshot = (
      snapshot: Awaited<ReturnType<typeof wsActions.agentChatGet>>,
      generation?: number,
    ) => {
      const state = {
        ...createChatTranscript(chatId, snapshot.messages ?? [], snapshot.meta),
        pendingPermission: snapshot.pending_permission ?? null,
        pendingSessionOp: snapshot.pending_session_op ?? null,
        queue: snapshot.queue ?? [],
        runningTurnId: snapshot.running_turn_id ?? null,
      };
      transcriptRef.current = state;
      const seq = snapshot.meta?.last_event_seq ?? 0;
      for (const decision of pump.finishHydrate(seq, generation)) applyDecision(decision);
      setTranscript(transcriptRef.current);
    };

    const subscribeFromCursor = async () => {
      const subscribed = await wsActions.agentChatSubscribe(client, {
        chat_id: chatId,
        after_sequence: pump.cursor,
      });
      return subscribed.last_event_seq ?? pump.cursor;
    };

    const resyncFromSnapshot = async () => {
      if (resyncing || cancelled) return;
      resyncing = true;
      const generation = pump.startHydrate();
      try {
        const snapshot = await wsActions.agentChatGet(client, { chat_id: chatId });
        if (cancelled) {
          if (shouldAbandonAgentChatHydrate("cancelled")) pump.abandonHydrate(generation);
          return;
        }
        applySnapshot(snapshot, generation);
        await subscribeFromCursor();
        failedResyncs = 0;
      } catch (err) {
        if (shouldAbandonAgentChatHydrate("error")) pump.abandonHydrate(generation);
        if (!cancelled) {
          setError(err instanceof Error && err.message ? err.message : "Could not load this chat.");
          const delay = nextAgentChatResyncDelayMs(failedResyncs);
          failedResyncs += 1;
          if (delay != null) {
            retryTimer = setTimeout(() => {
              retryTimer = null;
              void resyncFromSnapshot();
            }, delay);
          }
        }
      } finally {
        resyncing = false;
      }
    };

    const unsubscribeMessages = client.subscribeMessages((message) => {
      const event = agentChatEventFromMessage(message);
      if (!event || !eventsForChat(event, chatId)) return;
      const decision = pump.ingest(event);
      applyDecision(decision);
      if (decision.action === "apply" && decision.gap?.recommend === "resync") {
        void resyncFromSnapshot();
      }
    });

    void (async () => {
      let liveError: string | null = null;
      try {
        if (!isResume) {
          const generation = pump.startHydrate();
          const snapshot = await wsActions.agentChatGet(client, { chat_id: chatId });
          if (cancelled) {
            if (shouldAbandonAgentChatHydrate("cancelled")) pump.abandonHydrate(generation);
            return;
          }
          applySnapshot(snapshot, generation);
        }
        try {
          const serverSeq = await subscribeFromCursor();
          if (!cancelled && pump.shouldResyncFromServer(serverSeq)) {
            await resyncFromSnapshot();
          }
        } catch (err) {
          liveError =
            err instanceof Error && err.message ? err.message : "Could not subscribe to this chat.";
        }
        if (cancelled) return;
        loadedChatRef.current = chatId;
        loadedClientRef.current = client;
        setError(liveError);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        pump.abandonHydrate();
        setError(err instanceof Error && err.message ? err.message : "Could not load this chat.");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (retryTimer != null) clearTimeout(retryTimer);
      if (pump.hydrating) pump.abandonHydrate();
      clearInterval(flushTimer);
      unsubscribeMessages();
      void wsActions.agentChatUnsubscribe(client, { chat_id: chatId }).catch(() => undefined);
    };
  }, [chatId, client, wsState]);

  const send = useCallback(
    async (text: string, attachmentPaths?: string[]) => {
      if (!client) throw new Error("Atmos mobile WebSocket is not connected");
      try {
        await wsActions.agentChatSend(client, {
          chat_id: chatId,
          text,
          ...(attachmentPaths && attachmentPaths.length > 0
            ? { attachment_paths: attachmentPaths }
            : {}),
        });
        setError(null);
      } catch (err) {
        setError(copy.sendFailed);
        throw err;
      }
    },
    [chatId, client],
  );

  const steer = useCallback(
    async (text: string) => {
      if (!client) throw new Error("Atmos mobile WebSocket is not connected");
      const turnId = transcriptRef.current.runningTurnId;
      if (!turnId) {
        setError(copy.sendFailed);
        throw new Error("No running turn");
      }
      try {
        await wsActions.agentChatSteer(client, {
          chat_id: chatId,
          expected_turn_id: turnId,
          text,
        });
        setError(null);
      } catch (err) {
        setError(copy.sendFailed);
        throw err;
      }
    },
    [chatId, client],
  );

  const queueUpdate = useCallback(
    async (itemId: string, text: string) => {
      if (!client) throw new Error("Atmos mobile WebSocket is not connected");
      try {
        await wsActions.agentChatQueueUpdate(client, {
          chat_id: chatId,
          item_id: itemId,
          text,
        });
        setError(null);
      } catch (err) {
        setError(copy.sendFailed);
        throw err;
      }
    },
    [chatId, client],
  );

  const queueDelete = useCallback(
    async (itemId: string) => {
      if (!client) throw new Error("Atmos mobile WebSocket is not connected");
      try {
        await wsActions.agentChatQueueDelete(client, {
          chat_id: chatId,
          item_id: itemId,
        });
        setError(null);
      } catch (err) {
        setError(copy.sendFailed);
        throw err;
      }
    },
    [chatId, client],
  );

  const queueReorder = useCallback(
    async (itemIds: string[]) => {
      if (!client) throw new Error("Atmos mobile WebSocket is not connected");
      try {
        await wsActions.agentChatQueueReorder(client, {
          chat_id: chatId,
          item_ids: itemIds,
        });
        setError(null);
      } catch (err) {
        setError(copy.sendFailed);
        throw err;
      }
    },
    [chatId, client],
  );

  const queueAdd = useCallback(
    async (text: string, attachmentPaths?: string[]) => {
      if (!client) throw new Error("Atmos mobile WebSocket is not connected");
      try {
        await wsActions.agentChatQueueAdd(client, {
          chat_id: chatId,
          text,
          ...(attachmentPaths && attachmentPaths.length > 0
            ? { attachment_paths: attachmentPaths }
            : {}),
        });
        setError(null);
      } catch (err) {
        setError(copy.sendFailed);
        throw err;
      }
    },
    [chatId, client],
  );

  const cancel = useCallback(async () => {
    if (!client) throw new Error("Atmos mobile WebSocket is not connected");
    try {
      await wsActions.agentChatCancel(client, { chat_id: chatId });
      setError(null);
    } catch (err) {
      setError(copy.sendFailed);
      throw err;
    }
  }, [chatId, client]);

  const respondPermission = useCallback(
    async (input: { requestId: string; optionId?: string | null; allowed?: boolean | null }) => {
      if (!client) throw new Error("Atmos mobile WebSocket is not connected");
      try {
        await wsActions.agentChatPermissionRespond(client, {
          chat_id: chatId,
          request_id: input.requestId,
          option_id: input.optionId,
          allowed: input.allowed,
        });
        setError(null);
      } catch (err) {
        setError(copy.sendFailed);
        throw err;
      }
    },
    [chatId, client],
  );

  const respondSessionOp = useCallback(
    async (input: { requestId: string; optionId: string }) => {
      if (!client) throw new Error("Atmos mobile WebSocket is not connected");
      try {
        await wsActions.agentChatSessionOpRespond(client, {
          chat_id: chatId,
          request_id: input.requestId,
          option_id: input.optionId,
        });
        setError(null);
      } catch (err) {
        setError(copy.sendFailed);
        throw err;
      }
    },
    [chatId, client],
  );

  return {
    messages: transcript.messages,
    pendingPermission: transcript.pendingPermission,
    pendingSessionOp: transcript.pendingSessionOp,
    queue: transcript.queue,
    sessionUsage: transcript.sessionUsage,
    grokGoal: transcript.grokGoal,
    grokWorkflow: transcript.grokWorkflow,
    commands: transcript.commands,
    runningTurnId: transcript.runningTurnId,
    loading,
    error,
    send,
    steer,
    queueAdd,
    queueUpdate,
    queueDelete,
    queueReorder,
    cancel,
    respondPermission,
    respondSessionOp,
  };
}
