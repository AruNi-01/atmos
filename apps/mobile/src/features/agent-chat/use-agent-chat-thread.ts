import { useCallback, useEffect, useRef, useState } from "react";
import type { BackfillRequest } from "@atmos/api-client/agent-chat";
import { wsActions } from "@/api/ws-actions";
import { useMobileWs } from "@/providers/MobileWsProvider";
import { copy } from "./copy";
import { applyChatEvent, createChatTranscript, type ChatTranscriptState } from "./fold-transcript";
import { agentChatEventFromMessage, eventsForChat } from "./foreign-event";

function backfillKey(request: BackfillRequest): string {
  return `${request.partId}:${request.fromOffset}`;
}

export function useAgentChatThread(chatId: string) {
  const { client, state: wsState } = useMobileWs();
  const transcriptRef = useRef<ChatTranscriptState>(createChatTranscript(chatId));
  const [transcript, setTranscript] = useState<ChatTranscriptState>(transcriptRef.current);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (chatId.trim() === "") {
      return;
    }
    if (!client || wsState !== "open") {
      setLoading(false);
      setError("Atmos mobile WebSocket is not connected");
      return;
    }

    let cancelled = false;
    let ready = false;
    const buffer: ReturnType<typeof agentChatEventFromMessage>[] = [];
    const inflight = new Set<string>();
    const empty = createChatTranscript(chatId);
    transcriptRef.current = empty;
    setTranscript(empty);
    setLoading(true);
    setError(null);

    const requestBackfill = (request: BackfillRequest) => {
      const key = backfillKey(request);
      if (inflight.has(key)) return;
      inflight.add(key);
      void wsActions.agentChatBackfill(client, {
        chat_id: chatId,
        parts: [{ part_id: request.partId, from_offset: request.fromOffset }],
      }).catch(() => {
        if (!cancelled) setError("Could not catch up this chat.");
      }).finally(() => {
        inflight.delete(key);
      });
    };

    const publish = (next: ReturnType<typeof applyChatEvent>) => {
      transcriptRef.current = next.state;
      setTranscript(next.state);
      if (next.backfill) requestBackfill(next.backfill);
    };

    const unsubscribeMessages = client.subscribeMessages((message) => {
      const event = agentChatEventFromMessage(message);
      if (!event || !eventsForChat(event, chatId)) return;
      if (!ready) {
        buffer.push(event);
        return;
      }
      publish(applyChatEvent(transcriptRef.current, event));
    });

    void (async () => {
      let liveError: string | null = null;
      try {
        await wsActions.agentChatSubscribe(client, { chat_id: chatId });
      } catch (err) {
        liveError = err instanceof Error && err.message ? err.message : "Could not subscribe to this chat.";
      }
      if (cancelled) return;
      try {
        const history = await wsActions.agentChatMessages(client, { chat_id: chatId });
        if (cancelled) return;
        let state = createChatTranscript(chatId, history.messages ?? []);
        const queued = buffer.splice(0, buffer.length);
        for (const event of queued) {
          if (!event) continue;
          const next = applyChatEvent(state, event);
          state = next.state;
          if (next.backfill) requestBackfill(next.backfill);
        }
        transcriptRef.current = state;
        ready = true;
        setTranscript(state);
        setError(liveError);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        ready = true;
        setError(err instanceof Error && err.message ? err.message : "Could not load this chat.");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ready = false;
      unsubscribeMessages();
      void wsActions.agentChatUnsubscribe(client, { chat_id: chatId }).catch(() => undefined);
    };
  }, [chatId, client, wsState]);

  const send = useCallback(async (text: string, attachmentPaths?: string[]) => {
    if (!client) throw new Error("Atmos mobile WebSocket is not connected");
    try {
      await wsActions.agentChatSend(client, {
        chat_id: chatId,
        text,
        ...(attachmentPaths && attachmentPaths.length > 0 ? { attachment_paths: attachmentPaths } : {}),
      });
      setError(null);
    } catch (err) {
      setError(copy.sendFailed);
      throw err;
    }
  }, [chatId, client]);

  const steer = useCallback(async (text: string) => {
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
  }, [chatId, client]);

  const queueAdd = useCallback(async (text: string, attachmentPaths?: string[]) => {
    if (!client) throw new Error("Atmos mobile WebSocket is not connected");
    try {
      await wsActions.agentChatQueueAdd(client, {
        chat_id: chatId,
        text,
        ...(attachmentPaths && attachmentPaths.length > 0 ? { attachment_paths: attachmentPaths } : {}),
      });
      setError(null);
    } catch (err) {
      setError(copy.sendFailed);
      throw err;
    }
  }, [chatId, client]);

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

  const respondPermission = useCallback(async (input: {
    requestId: string;
    optionId?: string | null;
    allowed?: boolean | null;
  }) => {
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
  }, [chatId, client]);

  const respondSessionOp = useCallback(async (input: { requestId: string; optionId: string }) => {
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
  }, [chatId, client]);

  return {
    messages: transcript.messages,
    pendingPermission: transcript.pendingPermission,
    pendingSessionOp: transcript.pendingSessionOp,
    queue: transcript.queue,
    commands: transcript.commands,
    runningTurnId: transcript.runningTurnId,
    loading,
    error,
    send,
    steer,
    queueAdd,
    cancel,
    respondPermission,
    respondSessionOp,
  };
}
