"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, MessageCircleMore, MessageCirclePlus } from "lucide-react";
import { cn } from "@workspace/ui";

import type { TerminalSelectionSnapshot } from "@/features/terminal/types";
import {
  clampSelectionToolbarPosition,
  selectionToolbarDensity,
  type SelectionToolbarDensity,
} from "@/features/terminal/lib/terminal-selection-toolbar-position";
import { wrapAiContextClipboard } from "@/shared/lib/ai-context-protocol";

const toolbarActionClass =
  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
  const labeledWidthRef = React.useRef(0);
  const [density, setDensity] = React.useState<SelectionToolbarDensity>("labeled");
  const [position, setPosition] = React.useState(() =>
    snapshot
      ? {
          top: Math.max(6, snapshot.anchor.y - 44),
          left: Math.max(8, snapshot.anchor.x),
        }
      : { top: 0, left: 0 },
  );

  React.useLayoutEffect(() => {
    if (!snapshot) {
      labeledWidthRef.current = 0;
      if (density !== "labeled") setDensity("labeled");
      return;
    }

    const el = toolbarRef.current;
    if (!el) return;

    const container =
      (el.offsetParent instanceof HTMLElement ? el.offsetParent : null) ??
      el.parentElement;
    const containerWidth = container?.clientWidth ?? window.innerWidth;
    const containerHeight = container?.clientHeight ?? window.innerHeight;

    if (density === "labeled") {
      labeledWidthRef.current = el.offsetWidth;
    }

    const nextDensity = selectionToolbarDensity({
      labeledWidth: labeledWidthRef.current || el.offsetWidth,
      containerWidth,
      margin: 8,
    });
    if (nextDensity !== density) {
      setDensity(nextDensity);
      return;
    }

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
  }, [density, snapshot]);

  if (!snapshot) return null;

  const iconOnly = density === "icon";
  const stopToolbarEvent = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={toolbarRef}
      className={cn(
        "absolute z-30 flex w-max flex-nowrap items-center gap-1 whitespace-nowrap rounded-md border border-border/70 bg-background/95 p-1 text-xs shadow-lg backdrop-blur-md",
        className,
      )}
      style={{ top: position.top, left: position.left }}
      onPointerDown={stopToolbarEvent}
      onMouseDown={stopToolbarEvent}
      onDoubleClick={stopToolbarEvent}
    >
      <CopyButton
        text={wrapAiContextClipboard("terminal-selection", snapshot.text)}
        label={t("copy")}
        onDone={onDismiss}
      />
      <button
        type="button"
        className={cn(
          toolbarActionClass,
          "text-foreground hover:bg-muted",
          iconOnly ? "size-7" : "h-7 gap-1.5 px-2",
        )}
        onClick={(event) => {
          stopToolbarEvent(event);
          onAddAsContext(snapshot);
        }}
        title={t("addAsContext")}
        aria-label={t("addAsContext")}
      >
        <MessageCircleMore className="size-3.5" />
        {iconOnly ? null : <span>{t("addAsContext")}</span>}
      </button>
      {onSideChatForSelection ? (
        <button
          type="button"
          className={cn(
            toolbarActionClass,
            "text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-300",
            iconOnly ? "size-7" : "h-7 gap-1.5 px-2",
          )}
          onClick={(event) => {
            stopToolbarEvent(event);
            onSideChatForSelection(snapshot);
          }}
          title={t("sideChatForSelection")}
          aria-label={t("sideChatForSelection")}
        >
          <MessageCirclePlus className="size-3.5" />
          {iconOnly ? null : <span>{t("sideChatForSelection")}</span>}
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
      className={cn(
        toolbarActionClass,
        "size-7 text-foreground hover:bg-muted",
      )}
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
