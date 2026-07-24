"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, MessageCircleMore, MessageCirclePlus } from "lucide-react";
import { cn } from "@workspace/ui";

import type { TerminalSelectionSnapshot } from "@/features/terminal/types";
import { clampSelectionToolbarPosition } from "@/features/terminal/lib/terminal-selection-toolbar-position";

export function TerminalSelectionToolbar({
  className,
  onAddAsContext,
  onDismiss,
  onSideChatForSelection,
  snapshot,
}: {
  className?: string;
  onAddAsContext: (snapshot: TerminalSelectionSnapshot) => void;
  onDismiss?: () => void;
  onSideChatForSelection?: (snapshot: TerminalSelectionSnapshot) => void;
  snapshot: TerminalSelectionSnapshot | null;
}) {
  const t = useTranslations("terminal.agentInput.selectionContext");
  const toolbarRef = React.useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState(() =>
    snapshot
      ? {
          top: Math.max(6, snapshot.anchor.y - 44),
          left: Math.max(8, snapshot.anchor.x),
        }
      : { top: 0, left: 0 },
  );

  React.useLayoutEffect(() => {
    if (!snapshot) return;

    const el = toolbarRef.current;
    if (!el) return;

    const container =
      (el.offsetParent instanceof HTMLElement ? el.offsetParent : null) ??
      el.parentElement;
    const containerWidth = container?.clientWidth ?? window.innerWidth;
    const containerHeight = container?.clientHeight ?? window.innerHeight;

    const next = clampSelectionToolbarPosition({
      anchor: snapshot.anchor,
      toolbarWidth: el.offsetWidth,
      toolbarHeight: el.offsetHeight,
      containerWidth,
      containerHeight,
      margin: 8,
      gap: 8,
      preferredPlacement: "above",
    });

    setPosition((prev) => {
      if (prev.top === next.top && prev.left === next.left) return prev;
      return { top: next.top, left: next.left };
    });
  }, [snapshot]);

  if (!snapshot) return null;

  const stopToolbarEvent = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={toolbarRef}
      className={cn(
        "absolute z-30 flex -translate-x-1/2 items-center gap-1 rounded-md border border-border/70 bg-background/95 p-1 text-xs shadow-lg backdrop-blur-md",
        className,
      )}
      style={{ top: position.top, left: position.left }}
      onPointerDown={stopToolbarEvent}
      onMouseDown={stopToolbarEvent}
      onDoubleClick={stopToolbarEvent}
    >
      <CopyButton text={snapshot.text} label={t("copy")} onDone={onDismiss} />
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1.5 rounded px-2 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(event) => {
          stopToolbarEvent(event);
          onAddAsContext(snapshot);
        }}
        title={t("addAsContext")}
        aria-label={t("addAsContext")}
      >
        <MessageCircleMore className="size-3.5" />
        <span>{t("addAsContext")}</span>
      </button>
      {onSideChatForSelection ? (
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded px-2 text-cyan-700 transition-colors hover:bg-cyan-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-cyan-300"
          onClick={(event) => {
            stopToolbarEvent(event);
            onSideChatForSelection(snapshot);
          }}
          title={t("sideChatForSelection")}
          aria-label={t("sideChatForSelection")}
        >
          <MessageCirclePlus className="size-3.5" />
          <span>{t("sideChatForSelection")}</span>
        </button>
      ) : null}
    </div>
  );
}

function CopyButton({ text, label, onDone }: { text: string; label: string; onDone?: () => void }) {
  const [copied, setCopied] = React.useState(false);

  const stopToolbarEvent = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <button
      type="button"
      className="inline-flex size-7 items-center justify-center rounded text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) => {
        stopToolbarEvent(event);
        if (copied) return;
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => onDone?.(), 600);
        });
      }}
      title={label}
      aria-label={label}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}
