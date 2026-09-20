"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { useStickToBottomContext } from "@workspace/ui";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { findAgentChatScrollElement } from "@/features/agent/lib/agent-chat-transcript-window";
import { isPendingUserEcho } from "@/features/agent/lib/agent-chat-pending-echo";
import {
  OWN_SEND_EASE_CSS,
  ownSendDurationMs,
  ownSendInvertPx,
  shouldAnimateOwnSend,
  shouldResetOwnSend,
  type OwnSendKind,
} from "@/features/agent/lib/agent-chat-own-send";
import { useAgentChatOwnSendRefs } from "./agent-chat-own-send-context";

type OwnSendSession = {
  clientId: string;
  liveId: string;
  kind: OwnSendKind;
};

function lastUserIndex(messages: readonly AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

function findPrompt(root: ParentNode | null, id: string): HTMLElement | null {
  if (!root) return null;
  return root.querySelector(`[data-agent-chat-message="${CSS.escape(id)}"]`);
}

function promptRow(prompt: HTMLElement | null): HTMLElement | null {
  return prompt?.closest("[data-index]") ?? prompt;
}

function invertLayer(row: HTMLElement | null): HTMLElement | null {
  return row?.querySelector("[data-own-send-layer]") ?? row;
}

function findSendOrigin(transcript: HTMLElement | null): HTMLElement | null {
  const column = transcript?.closest("[data-agent-chat-column]");
  if (!column) return null;
  return (
    column.querySelector<HTMLElement>("[data-agent-chat-composer] [contenteditable='true']")
    ?? column.querySelector<HTMLElement>("[data-agent-chat-composer]")
    ?? column.querySelector<HTMLElement>("[data-agent-chat-composer-dock]")
  );
}

function writeLayerInvert(layer: HTMLElement | null, invertPx: number, durationMs: number) {
  if (!layer) return;
  const next = invertPx === 0 ? "translateY(0px)" : `translateY(${invertPx}px)`;
  if (durationMs <= 0) {
    layer.style.transition = "none";
    if (invertPx === 0) {
      layer.style.transform = "";
      layer.style.willChange = "";
    } else {
      layer.style.willChange = "transform";
      layer.style.transform = next;
    }
    return;
  }
  layer.style.willChange = "transform";
  layer.style.transition = `transform ${durationMs}ms ${OWN_SEND_EASE_CSS}`;
  layer.style.transform = next;
}

function markTranscript(transcript: HTMLElement | null, kind: OwnSendKind | null) {
  if (!transcript) return;
  if (kind) transcript.setAttribute("data-agent-chat-own-send", kind);
  else transcript.removeAttribute("data-agent-chat-own-send");
}

export function AgentChatOwnSendRuntime({
  messages,
  transcriptRef,
  reduceMotion,
  enabled,
  resetKey,
}: {
  messages: AgentMessage[];
  transcriptRef: RefObject<HTMLDivElement | null>;
  reduceMotion: boolean;
  enabled: boolean;
  resetKey: string;
}) {
  const { isAtBottom } = useStickToBottomContext();
  const refs = useAgentChatOwnSendRefs();
  const sessionRef = useRef<OwnSendSession | null>(null);
  const playingRef = useRef(false);
  const handledIdRef = useRef<string | null>(null);
  const resetKeyRef = useRef(resetKey);
  const finishTimerRef = useRef<number | null>(null);
  const isAtBottomRef = useRef(isAtBottom);
  isAtBottomRef.current = isAtBottom;

  const cancelTimers = () => {
    if (finishTimerRef.current != null) {
      window.clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
  };

  const clearSession = () => {
    cancelTimers();
    const session = sessionRef.current;
    if (session) {
      const node = findPrompt(transcriptRef.current, session.liveId);
      writeLayerInvert(invertLayer(promptRow(node)), 0, 0);
    }
    sessionRef.current = null;
    playingRef.current = false;
    markTranscript(transcriptRef.current, null);
    if (refs) {
      refs.liveIdRef.current = null;
      refs.pendingIdRef.current = null;
      refs.itemKeyRef.current = null;
      refs.anchorIndexRef.current = null;
      refs.invertPxRef.current = 0;
      refs.skipEndAnchorRef.current = false;
      refs.kindRef.current = null;
    }
  };

  useLayoutEffect(() => {
    if (shouldResetOwnSend(resetKeyRef.current, resetKey)) {
      handledIdRef.current = null;
      clearSession();
    }
    resetKeyRef.current = resetKey;

    if (!enabled || !refs) {
      clearSession();
      return;
    }
    if (messages.length === 0) {
      handledIdRef.current = null;
      clearSession();
      return;
    }

    const userIndex = lastUserIndex(messages);
    const lastUser = userIndex >= 0 ? messages[userIndex] : null;
    if (!lastUser) return;

    const session = sessionRef.current;
    if (isPendingUserEcho(lastUser) && session?.clientId !== lastUser.id) {
      if (handledIdRef.current === lastUser.id) return;
      const kind: OwnSendKind = messages.filter((item) => item.role === "user").length <= 1
        ? "first"
        : "follow";
      if (!shouldAnimateOwnSend(kind, isAtBottomRef.current)) {
        handledIdRef.current = lastUser.id;
        clearSession();
        return;
      }
      cancelTimers();
      handledIdRef.current = lastUser.id;
      sessionRef.current = {
        clientId: lastUser.id,
        liveId: lastUser.id,
        kind,
      };
      refs.pendingIdRef.current = lastUser.id;
      refs.liveIdRef.current = lastUser.id;
      refs.itemKeyRef.current = lastUser.id;
      refs.anchorIndexRef.current = userIndex;
      refs.kindRef.current = kind;
      refs.skipEndAnchorRef.current = kind === "first";
      refs.invertPxRef.current = 0;
      playingRef.current = false;
      markTranscript(transcriptRef.current, kind);
      return;
    }

    if (session && lastUser.id !== session.liveId && !isPendingUserEcho(lastUser)) {
      session.liveId = lastUser.id;
      refs.liveIdRef.current = lastUser.id;
      refs.pendingIdRef.current = null;
      refs.anchorIndexRef.current = userIndex;
    }
  });

  useLayoutEffect(() => {
    if (!enabled || !refs) return;

    const play = (): boolean => {
      const session = sessionRef.current;
      if (!session || playingRef.current) return true;
      const prompt = findPrompt(transcriptRef.current, session.liveId);
      if (!prompt) return false;

      const origin = findSendOrigin(transcriptRef.current);
      const promptTop = prompt.getBoundingClientRect().top;
      const originTop = origin?.getBoundingClientRect().top
        ?? promptTop + (session.kind === "first"
          ? (findAgentChatScrollElement(transcriptRef.current)?.clientHeight ?? 0) / 2
          : 0);
      const invert = reduceMotion ? 0 : ownSendInvertPx(promptTop, originTop, session.kind);
      const layer = invertLayer(promptRow(prompt));
      refs.invertPxRef.current = invert;
      playingRef.current = true;

      const finish = () => {
        finishTimerRef.current = null;
        const live = findPrompt(transcriptRef.current, sessionRef.current?.liveId ?? session.liveId);
        writeLayerInvert(invertLayer(promptRow(live)), 0, 0);
        markTranscript(transcriptRef.current, null);
        sessionRef.current = null;
        playingRef.current = false;
        refs.liveIdRef.current = null;
        refs.pendingIdRef.current = null;
        refs.itemKeyRef.current = null;
        refs.kindRef.current = null;
        refs.anchorIndexRef.current = null;
        refs.invertPxRef.current = 0;
        refs.skipEndAnchorRef.current = false;
      };

      if (invert === 0) {
        finish();
        return true;
      }

      writeLayerInvert(layer, invert, 0);
      if (layer) void layer.getBoundingClientRect();
      const duration = ownSendDurationMs(session.kind);
      writeLayerInvert(layer, 0, duration);
      refs.invertPxRef.current = 0;
      finishTimerRef.current = window.setTimeout(finish, duration + 32);
      return true;
    };

    if (play()) return;
    const root = transcriptRef.current;
    if (!root || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      if (play()) observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [enabled, messages, reduceMotion, refs, transcriptRef]);

  useLayoutEffect(() => () => {
    cancelTimers();
  }, []);

  return null;
}
