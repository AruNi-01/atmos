"use client";

import React, { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/ui/hover-card";
import {
  buildPastePreview,
  collapsedUserMessageText,
  displayTextForSentMessage,
  splitComposerDisplaySegments,
  userMessageNeedsCollapse,
  type ComposerDisplaySegment,
} from "@/shared/lib/composer-paste";
import { splitTextWithHttpUrls } from "@/shared/lib/link-preview";
import { LinkPreviewChip } from "@/shared/components/link-preview-chip";

export function UserMessageBody({ text }: { text: string }) {
  const display = displayTextForSentMessage(text);
  const segments = splitComposerDisplaySegments(display);
  const hasPasteChip = segments.some((segment) => segment.type === "paste");
  const needsLineCollapse = userMessageNeedsCollapse(text);
  const canToggle = hasPasteChip || needsLineCollapse;
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
  const visibleText =
    collapsed && needsLineCollapse ? collapsedUserMessageText(text) : text;

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
        <UserMessageText text={visibleText} />
      )}
    </div>
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

function UrlAwareText({ text }: { text: string }) {
  return (
    <>
      {splitTextWithHttpUrls(text).map((segment, index) =>
        segment.type === "url" ? (
          <LinkPreviewChip key={`url-${index}`} href={segment.url}>
            {segment.url}
          </LinkPreviewChip>
        ) : (
          <React.Fragment key={`text-${index}`}>{segment.value}</React.Fragment>
        ),
      )}
    </>
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
