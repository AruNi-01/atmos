"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  collectTurnFileChanges,
  selectRangesForTurnFile,
  type TurnFileChange,
} from "@/features/agent/lib/tool-results/turn-file-changes";
import { displayAgentChatFilePath, resolveAgentChatOpenableFile } from "@/features/agent/lib/agent-chat-file-links";
import { useOpenAgentChatWorkspacePath } from "@/features/agent/hooks/use-open-agent-chat-path";
import { useAgentChatCwd, useAgentChatPathRoots } from "./agent-chat-cwd-context";
import { AgentToolFileChangeStats, AgentToolFileGlyph, fileNameFromPath } from "./tool-results/AgentToolCard";

const PREVIEW_COUNT = 3;
const ROW_CLASS_NAME = "flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm";

function FileChangeRow({
  change,
  tooltip,
  openable,
  onOpen,
}: {
  change: TurnFileChange;
  tooltip: string;
  openable: boolean;
  onOpen: (path: string) => void;
}) {
  const name = fileNameFromPath(change.path);
  const body = (
    <>
      <AgentToolFileGlyph path={change.path} className="size-4" />
      <span className="min-w-0 flex-1 truncate text-foreground">
        {name}
      </span>
      <AgentToolFileChangeStats additions={change.additions} deletions={change.deletions} />
    </>
  );
  const row = openable ? (
    <button
      type="button"
      className={`${ROW_CLASS_NAME} w-full cursor-pointer hover:bg-background/60`}
      onClick={() => onOpen(change.path)}
    >
      {body}
    </button>
  ) : (
    <div className={ROW_CLASS_NAME}>
      {body}
    </div>
  );
  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>{row}</TooltipTrigger>
        <TooltipContent side="top" className="z-50 max-w-sm break-all font-mono text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

export function AssistantTurnFileChanges({
  parts,
  visible,
}: {
  parts: AgentPart[];
  visible: boolean;
}) {
  const t = useTranslations("Agent.components.assistantTurn.files");
  const cwd = useAgentChatCwd();
  const roots = useAgentChatPathRoots();
  const openWorkspacePath = useOpenAgentChatWorkspacePath();
  const [expanded, setExpanded] = useState(false);
  const changes = useMemo(
    () => collectTurnFileChanges(parts, { includeRanges: false }),
    [parts],
  );

  if (!visible || changes.length === 0) return null;

  const hidden = Math.max(0, changes.length - PREVIEW_COUNT);
  const preview = hidden > 0 ? changes.slice(0, PREVIEW_COUNT) : changes;
  const extra = hidden > 0 ? changes.slice(PREVIEW_COUNT) : [];

  const renderChange = (change: TurnFileChange) => (
    <FileChangeRow
      key={change.path}
      change={change}
      tooltip={displayAgentChatFilePath(change.path, cwd, roots)}
      openable={Boolean(resolveAgentChatOpenableFile(change.path, cwd, roots))}
      onOpen={(path) => {
        void openWorkspacePath(path, {
          isDir: false,
          selectRanges: selectRangesForTurnFile(parts, path),
        });
      }}
    />
  );

  return (
    <div className="mt-3 w-full min-w-0 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 pb-1">
        <p className="text-sm text-muted-foreground">
          {t("changed", { count: changes.length })}
        </p>
      </div>
      <ul className="flex flex-col">
        {preview.map(renderChange)}
      </ul>
      {hidden > 0 ? (
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleContent className="motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none">
            <ul className="flex max-h-44 flex-col overflow-y-auto">
              {extra.map(renderChange)}
            </ul>
          </CollapsibleContent>
          <CollapsibleTrigger className="mt-0.5 py-1 text-left text-sm text-muted-foreground hover:text-foreground">
            {expanded ? t("showLess") : t("showMore", { count: hidden })}
          </CollapsibleTrigger>
        </Collapsible>
      ) : null}
    </div>
  );
}
