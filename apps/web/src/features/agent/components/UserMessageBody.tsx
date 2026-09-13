"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/ui/hover-card";
import {
  buildPastePreview,
  displayTextForSentMessage,
  splitComposerDisplaySegments,
  USER_MESSAGE_COLLAPSE_FADE_LINES,
  USER_MESSAGE_COLLAPSE_LINES,
  userMessageNeedsCollapse,
  type ComposerDisplaySegment,
} from "@/shared/lib/composer-paste";
import { displayTextWithUrlTokens } from "@/shared/lib/link-preview";
import { UrlAwareText } from "@/shared/components/url-aware-text";

export function UserMessageBody({ text }: { text: string }) {
  const display = displayTextForSentMessage(text);
  const segments = splitComposerDisplaySegments(display);
  const hasPasteChip = segments.some((segment) => segment.type === "paste");
  const needsLineCollapse = userMessageNeedsCollapse(text);
  const [expanded, setExpanded] = useState(false);
  const [overflowsVisually, setOverflowsVisually] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  const canToggle = hasPasteChip || needsLineCollapse || overflowsVisually;

  useEffect(() => {
    if (!expanded || !canToggle) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setExpanded(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [canToggle, expanded]);

  const collapsed = canToggle && !expanded;
  const showChips = hasPasteChip && collapsed;
  const clipText = !showChips && !expanded;
  const withUrlTokens = displayTextWithUrlTokens(text);

  useLayoutEffect(() => {
    if (hasPasteChip) {
      setOverflowsVisually(false);
      return;
    }
    const el = clipRef.current;
    if (!el) return;
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
      const limit = (Number.isFinite(lineHeight) ? lineHeight : 21) * USER_MESSAGE_COLLAPSE_LINES;
      setOverflowsVisually(el.scrollHeight > limit + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasPasteChip, text, expanded]);

  return (
    <div
      ref={rootRef}
      data-user-message-body=""
      data-user-message-collapsed={collapsed ? "" : undefined}
      className={collapsed ? "cursor-pointer" : undefined}
      role={collapsed ? "button" : undefined}
      aria-expanded={canToggle ? expanded : undefined}
      tabIndex={collapsed ? 0 : undefined}
      onClick={() => {
        if (!collapsed) return;
        setExpanded(true);
      }}
      onKeyDown={(event) => {
        if (!collapsed) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setExpanded(true);
      }}
    >
      {showChips ? (
        <UserMessageSegments segments={segments} />
      ) : (
        <div
          ref={clipRef}
          data-user-message-fade={collapsed && clipText ? "" : undefined}
          className={
            clipText
              ? "relative min-w-0 overflow-hidden leading-[1.5]"
              : "relative min-w-0 leading-[1.5]"
          }
          style={
            clipText
              ? { maxHeight: `${USER_MESSAGE_COLLAPSE_LINES + USER_MESSAGE_COLLAPSE_FADE_LINES}lh` }
              : undefined
          }
        >
          <div style={collapsed && clipText ? userMessageCollapseMaskStyle() : undefined}>
            <UserMessageText text={withUrlTokens} />
          </div>
          {collapsed && clipText ? <UserMessageCollapseWash /> : null}
        </div>
      )}
    </div>
  );
}

function userMessageCollapseMaskStyle(): React.CSSProperties {
  const solid = `${USER_MESSAGE_COLLAPSE_LINES}lh`;
  const end = `${USER_MESSAGE_COLLAPSE_LINES + USER_MESSAGE_COLLAPSE_FADE_LINES}lh`;
  const mask = `linear-gradient(to bottom, #000 0, #000 ${solid}, transparent ${end})`;
  return {
    WebkitMaskImage: mask,
    maskImage: mask,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };
}

function UserMessageCollapseWash() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[1lh] bg-gradient-to-b from-secondary/0 to-secondary"
    />
  );
}

function UserMessageText({ text }: { text: string }) {
  return (
    <div
      className="whitespace-pre-wrap"
      style={{ overflowWrap: "break-word", wordBreak: "normal" }}
    >
      <UrlAwareText text={text} />
    </div>
  );
}

function UserMessageSegments({ segments }: { segments: ComposerDisplaySegment[] }) {
  return (
    <div
      className="whitespace-pre-wrap"
      style={{ overflowWrap: "break-word", wordBreak: "normal" }}
    >
      {segments.map((segment, index) =>
        segment.type === "paste" ? (
          <PastedTextChip
            key={`${segment.token}-${index}`}
            lineCount={segment.lineCount}
            text={segment.text}
          />
        ) : (
          <UrlAwareText key={`text-${index}`} text={segment.value} />
        ),
      )}
    </div>
  );
}

function PastedTextChip({ lineCount, text }: { lineCount: number; text: string }) {
  const t = useTranslations("Agent.components.chatPanel.paste");
  const preview = buildPastePreview(text);
  return (
    <HoverCard openDelay={180} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span
          data-paste-chip=""
          className="inline-flex h-5 cursor-pointer select-none items-center gap-1 box-border rounded-full border border-border/70 bg-muted/60 px-1.5 align-middle text-[12px] font-medium leading-none text-foreground"
        >
          <PasteChipIcon />
          {t("chip", { count: lineCount })}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="center"
        avoidCollisions
        collisionPadding={12}
        className="w-max max-w-80 p-3 text-xs leading-5"
      >
        <div className="whitespace-pre-wrap break-words">{preview.head.join("\n")}</div>
        {preview.more > 0 ? (
          <div className="py-0.5 text-muted-foreground/55">
            {t("moreLines", { count: preview.more })}
          </div>
        ) : null}
        {preview.tail.length > 0 ? (
          <div className="whitespace-pre-wrap break-words">{preview.tail.join("\n")}</div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

function PasteChipIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 2h6v2H9z" />
    </svg>
  );
}
