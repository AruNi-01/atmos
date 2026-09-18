"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { useStickToBottomContext } from "@workspace/ui";
import type { AgentMessage } from "@atmos/api-types/ws/dto/agent-chat";
import { findAgentChatScrollElement } from "@/features/agent/lib/agent-chat-transcript-window";
import { isPendingUserEcho } from "@/features/agent/lib/agent-chat-pending-echo";
import {
  firstSendInvertPx,
  ownSendPinScrollTop,
  ownSendRunwayOverflowed,
  ownSendRunwayPx,
  ownSendTopInset,
  ownSendGlideDone,
  shouldRunOwnSendPin,
  stepOwnSendGlide,
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

function writeRowInvert(row: HTMLElement | null, invertPx: number) {
  if (!row) return;
  const current = row.style.transform;
  const match = current.match(/translateY\(([-0-9.]+)px\)/);
  const previous = Number(row.dataset.ownSendInvert) || 0;
  const base = match ? Number(match[1]) - previous : 0;
  row.dataset.ownSendInvert = String(invertPx);
  row.style.transform = `translateY(${base + invertPx}px)`;
}

function contentBelowPrompt(
  scroll: HTMLElement,
  prompt: HTMLElement,
  runwayPx: number,
): number {
  const frame = scroll.getBoundingClientRect().top;
  const promptBottom = prompt.getBoundingClientRect().bottom - frame + scroll.scrollTop;
  return Math.max(0, scroll.scrollHeight - promptBottom - runwayPx);
}

function pinTop(scroll: HTMLElement, prompt: HTMLElement, kind: OwnSendKind): number {
  const frame = scroll.getBoundingClientRect().top;
  const offset = prompt.getBoundingClientRect().top - frame + scroll.scrollTop;
  const maxScroll = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
  return ownSendPinScrollTop(offset, ownSendTopInset(kind), maxScroll);
}

export function AgentChatOwnSendRuntime({
  messages,
  transcriptRef,
  runwayPx,
  onRunwayPxChange,
  reduceMotion,
  enabled,
  resetKey,
}: {
  messages: AgentMessage[];
  transcriptRef: RefObject<HTMLDivElement | null>;
  runwayPx: number;
  onRunwayPxChange: (px: number) => void;
  reduceMotion: boolean;
  enabled: boolean;
  resetKey: string;
}) {
  const stick = useStickToBottomContext();
  const { stopScroll, scrollToBottom, isAtBottom } = stick;
  const refs = useAgentChatOwnSendRefs();
  const sessionRef = useRef<OwnSendSession | null>(null);
  const holdRef = useRef(false);
  const releasedRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const glideIdRef = useRef<string | null>(null);
  const skippedIdRef = useRef<string | null>(null);
  const runwayLockedRef = useRef(false);
  const runwayPxRef = useRef(runwayPx);
  const resetKeyRef = useRef(resetKey);
  const stickRef = useRef(stick);
  runwayPxRef.current = runwayPx;
  stickRef.current = stick;

  const cancelGlide = () => {
    if (frameRef.current != null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };

  const applyPinTarget = (on: boolean) => {
    stickRef.current.targetScrollTop = on
      ? (defaultTarget, { scrollElement }) => {
          const session = sessionRef.current;
          if (!session || releasedRef.current) return defaultTarget;
          const node = findPrompt(transcriptRef.current, session.liveId);
          if (!node) return defaultTarget;
          return pinTop(scrollElement, node, session.kind);
        }
      : null;
  };

  const clearSession = (dropRunway: boolean) => {
    cancelGlide();
    glideIdRef.current = null;
    sessionRef.current = null;
    holdRef.current = false;
    releasedRef.current = false;
    runwayLockedRef.current = false;
    applyPinTarget(false);
    if (refs) {
      refs.liveIdRef.current = null;
      refs.pendingIdRef.current = null;
      refs.anchorIndexRef.current = null;
      refs.invertPxRef.current = 0;
      refs.skipEndAnchorRef.current = false;
      refs.kindRef.current = null;
    }
    if (dropRunway && runwayPxRef.current !== 0) onRunwayPxChange(0);
  };

  useLayoutEffect(() => {
    if (!enabled || !refs) {
      clearSession(true);
      return;
    }
    if (messages.length === 0) {
      clearSession(true);
      return;
    }

    const userIndex = lastUserIndex(messages);
    const lastUser = userIndex >= 0 ? messages[userIndex] : null;
    if (!lastUser) return;

    const session = sessionRef.current;
    if (isPendingUserEcho(lastUser) && session?.clientId !== lastUser.id) {
      if (skippedIdRef.current === lastUser.id) return;
      cancelGlide();
      glideIdRef.current = null;
      const kind: OwnSendKind = messages.filter((item) => item.role === "user").length <= 1
        ? "first"
        : "follow";
      if (!shouldRunOwnSendPin(kind, isAtBottom)) {
        skippedIdRef.current = lastUser.id;
        clearSession(true);
        return;
      }
      skippedIdRef.current = null;
      sessionRef.current = {
        clientId: lastUser.id,
        liveId: lastUser.id,
        kind,
      };
      refs.pendingIdRef.current = lastUser.id;
      refs.liveIdRef.current = lastUser.id;
      refs.anchorIndexRef.current = userIndex;
      refs.kindRef.current = kind;
      refs.skipEndAnchorRef.current = kind === "first";
      refs.invertPxRef.current = 0;
      holdRef.current = false;
      releasedRef.current = false;
      runwayLockedRef.current = false;
      applyPinTarget(true);
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
    const session = sessionRef.current;
    const scroll = findAgentChatScrollElement(transcriptRef.current);
    if (!session || !scroll) return;
    const prompt = findPrompt(transcriptRef.current, session.liveId);
    if (!prompt) return;
    if (!runwayLockedRef.current) {
      const nextRunway = ownSendRunwayPx(
        scroll.clientHeight,
        prompt.offsetHeight,
        ownSendTopInset(session.kind),
        contentBelowPrompt(scroll, prompt, runwayPxRef.current),
      );
      runwayLockedRef.current = true;
      if (nextRunway !== runwayPxRef.current) {
        onRunwayPxChange(nextRunway);
        return;
      }
    }
    if (glideIdRef.current === session.clientId) return;

    glideIdRef.current = session.clientId;
    const row = promptRow(prompt);
    let current: number;
    if (session.kind === "first") {
      current = reduceMotion ? 0 : firstSendInvertPx(scroll.clientHeight, prompt.offsetHeight);
      refs.invertPxRef.current = current;
      writeRowInvert(row, current);
      if (current === 0) {
        holdRef.current = true;
        refs.skipEndAnchorRef.current = false;
        return;
      }
    } else {
      current = scroll.scrollTop;
      refs.invertPxRef.current = 0;
      writeRowInvert(row, 0);
    }

    const tick = () => {
      if (releasedRef.current) return;
      const active = sessionRef.current;
      if (!active || glideIdRef.current !== active.clientId) return;
      const node = findPrompt(transcriptRef.current, active.liveId);
      const nextRow = promptRow(node);
      if (!node || !scroll.isConnected) return;
      if (active.kind === "first") {
        const target = 0;
        current = reduceMotion ? target : stepOwnSendGlide(current, target);
        refs.invertPxRef.current = current;
        writeRowInvert(nextRow, current);
        if (ownSendGlideDone(current, target)) {
          holdRef.current = true;
          refs.skipEndAnchorRef.current = false;
          return;
        }
      } else {
        const target = pinTop(scroll, node, active.kind);
        current = reduceMotion ? target : stepOwnSendGlide(current, target);
        scroll.scrollTop = current;
        if (ownSendGlideDone(current, target)) {
          holdRef.current = true;
          void scrollToBottom({ animation: "instant" });
          return;
        }
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
  }, [enabled, messages, onRunwayPxChange, reduceMotion, refs, runwayPx, scrollToBottom, transcriptRef]);

  useLayoutEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
    skippedIdRef.current = null;
    clearSession(true);
  }, [resetKey]);

  useLayoutEffect(() => () => {
    if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  useLayoutEffect(() => {
    if (!enabled) return;
    const scroll = findAgentChatScrollElement(transcriptRef.current);
    if (!scroll) return;

    const release = () => {
      if (!sessionRef.current) return;
      releasedRef.current = true;
      holdRef.current = false;
      applyPinTarget(false);
      if (refs) refs.skipEndAnchorRef.current = false;
      stopScroll();
    };
    scroll.addEventListener("wheel", release, { passive: true });
    scroll.addEventListener("touchmove", release, { passive: true });

    const hold = () => {
      const session = sessionRef.current;
      if (!session || releasedRef.current || !refs) return;
      const node = findPrompt(transcriptRef.current, session.liveId);
      if (!node) return;
      if (!runwayLockedRef.current) {
        const nextRunway = ownSendRunwayPx(
          scroll.clientHeight,
          node.offsetHeight,
          ownSendTopInset(session.kind),
          contentBelowPrompt(scroll, node, runwayPxRef.current),
        );
        runwayLockedRef.current = true;
        if (nextRunway !== runwayPxRef.current) onRunwayPxChange(nextRunway);
      }
      const below = contentBelowPrompt(scroll, node, runwayPxRef.current);
      if (
        ownSendRunwayOverflowed(
          below,
          scroll.clientHeight,
          node.offsetHeight,
          ownSendTopInset(session.kind),
        )
      ) {
        releasedRef.current = true;
        holdRef.current = false;
        refs.skipEndAnchorRef.current = false;
        applyPinTarget(false);
        if (runwayPxRef.current !== 0) onRunwayPxChange(0);
        sessionRef.current = null;
        refs.liveIdRef.current = null;
        refs.pendingIdRef.current = null;
        refs.kindRef.current = null;
        void scrollToBottom();
        return;
      }
      if (!holdRef.current) return;
      if (session.kind === "first") {
        if (refs.invertPxRef.current !== 0) {
          refs.invertPxRef.current = 0;
          writeRowInvert(promptRow(node), 0);
        }
        if (scroll.scrollTop !== 0) scroll.scrollTop = 0;
        return;
      }
      const target = pinTop(scroll, node, session.kind);
      if (Math.abs(scroll.scrollTop - target) > 0.5) scroll.scrollTop = target;
    };

    const observer = new ResizeObserver(hold);
    observer.observe(scroll);
    const content = scroll.firstElementChild;
    if (content instanceof HTMLElement) observer.observe(content);
    scroll.addEventListener("scroll", hold, { passive: true });
    return () => {
      observer.disconnect();
      scroll.removeEventListener("wheel", release);
      scroll.removeEventListener("touchmove", release);
      scroll.removeEventListener("scroll", hold);
    };
  }, [enabled, onRunwayPxChange, refs, scrollToBottom, stopScroll, transcriptRef]);

  return null;
}
