"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  collectTurnFileChanges,
  selectRangesForTurnFile,
} from "@/features/agent/lib/tool-results/turn-file-changes";
import { displayAgentChatFilePath, resolveAgentChatOpenableFile } from "@/features/agent/lib/agent-chat-file-links";
import { useOpenAgentChatWorkspacePath } from "@/features/agent/hooks/use-open-agent-chat-path";
import { useAgentChatCwd, useAgentChatPathRoots } from "./agent-chat-cwd-context";
import { AgentToolFileChangeStats, AgentToolFileGlyph, fileNameFromPath } from "./tool-results/AgentToolCard";

const PREVIEW_COUNT = 3;

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
  const shown = expanded ? changes : changes.slice(0, PREVIEW_COUNT);

  return (
    <div className="mt-3 w-full min-w-0 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 pb-1">
        <p className="text-sm text-muted-foreground">
          {t("changed", { count: changes.length })}
        </p>
      </div>
      <ul
        className={
          expanded && changes.length > PREVIEW_COUNT
            ? "flex max-h-44 flex-col overflow-y-auto"
            : "flex flex-col"
        }
      >
        {shown.map((change) => {
          const name = fileNameFromPath(change.path);
          const tooltip = displayAgentChatFilePath(change.path, cwd, roots);
          const openable = resolveAgentChatOpenableFile(change.path, cwd, roots);
          const rowClassName = "flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm";
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
              className={`${rowClassName} w-full cursor-pointer hover:bg-background/60`}
              onClick={() => {
                void openWorkspacePath(change.path, {
                  isDir: false,
                  selectRanges: selectRangesForTurnFile(parts, change.path),
                });
              }}
            >
              {body}
            </button>
          ) : (
            <div className={rowClassName}>
              {body}
            </div>
          );
          return (
            <li key={change.path}>
              <Tooltip>
                <TooltipTrigger asChild>{row}</TooltipTrigger>
                <TooltipContent side="top" className="z-50 max-w-sm break-all font-mono text-xs">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          className="mt-0.5 py-1 text-left text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t("showLess") : t("showMore", { count: hidden })}
        </button>
      ) : null}
    </div>
  );
}
