"use client";

import { Button } from "@workspace/ui";
import { mdLiveCopy } from "../lib/md-live-copy";
import type { MdLiveAiActionKind, MdLiveBlockAction } from "../lib/md-live-editor-registry";

export function MdLiveSelectionToolbar({
  onBlock,
  onAi,
}: {
  onBlock: (action: MdLiveBlockAction) => void;
  onAi: (kind: MdLiveAiActionKind) => void;
}) {
  return (
    <div
      data-md-live-toolbar="true"
      className="flex items-center gap-0.5 rounded-md border border-border bg-popover p-1 text-xs shadow-md"
    >
      <ToolbarButton label={mdLiveCopy("toolbarHeading")} onClick={() => onBlock({ type: "heading", level: 2 })} />
      <ToolbarButton label={mdLiveCopy("toolbarList")} onClick={() => onBlock({ type: "bullet-list" })} />
      <ToolbarButton label={mdLiveCopy("toolbarQuote")} onClick={() => onBlock({ type: "quote" })} />
      <ToolbarButton label={mdLiveCopy("toolbarCode")} onClick={() => onBlock({ type: "code" })} />
      <span className="mx-0.5 h-4 w-px bg-border" />
      <ToolbarButton label={mdLiveCopy("toolbarAsk")} onClick={() => onAi("ask")} />
      <ToolbarButton label={mdLiveCopy("toolbarRewrite")} onClick={() => onAi("rewrite")} />
      <ToolbarButton label={mdLiveCopy("toolbarSummarize")} onClick={() => onAi("summarize")} />
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 px-2"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
