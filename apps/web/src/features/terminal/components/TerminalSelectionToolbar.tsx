"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MessageCircleMore, MessageCirclePlus } from "lucide-react";
import { cn } from "@workspace/ui";

import type { TerminalSelectionSnapshot } from "@/features/terminal/types";

export function TerminalSelectionToolbar({
  className,
  onAddAsContext,
  onSideChatForSelection,
  snapshot,
}: {
  className?: string;
  onAddAsContext: (snapshot: TerminalSelectionSnapshot) => void;
  onSideChatForSelection: (snapshot: TerminalSelectionSnapshot) => void;
  snapshot: TerminalSelectionSnapshot | null;
}) {
  const t = useTranslations("terminal.agentInput.selectionContext");
  if (!snapshot) return null;

  const top = Math.max(6, snapshot.anchor.y - 44);
  const left = Math.max(8, snapshot.anchor.x);

  const stopToolbarEvent = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className={cn(
        "absolute z-30 flex -translate-x-1/2 items-center gap-1 rounded-md border border-border/70 bg-background/95 p-1 text-xs shadow-lg backdrop-blur-md",
        className,
      )}
      style={{ top, left }}
      onPointerDown={stopToolbarEvent}
      onMouseDown={stopToolbarEvent}
      onDoubleClick={stopToolbarEvent}
    >
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
    </div>
  );
}
