"use client";

import { useTranslations } from "next-intl";
import {
  AcpTerminal,
  AcpTerminalContent,
} from "@workspace/ui";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { getToolKindIcon } from "../lib/chat-helpers";
import { isBackgroundToolCall } from "../lib/agent/background-command";
import { preferredCollapsedToolTitle } from "@/features/agent/lib/tool-results/parse-tool-result";
import { AgentToolCard, type AgentToolSurface } from "./tool-results/AgentToolCard";
import { AgentToolEmptyBody } from "./tool-results/AgentToolBodies";
import { AgentCommandLine } from "./AgentCommandLine";
import { cn } from "@/shared/lib/utils";

function executeFields(part: AgentToolCallPart): { command: string; output: string; cwd?: string | null } {
  const command = part.params?.type === "execute" ? part.params.command : "";
  const cwd = part.params?.type === "execute" ? part.params.cwd : null;
  const output = part.result?.type === "execute"
    ? part.result.output
    : part.result?.type === "text"
      ? part.result.text
      : part.result?.type === "error"
        ? part.result.message
        : "";
  return { command, output, cwd };
}

export function TerminalBlock({
  part,
  surface = "card",
}: {
  part: AgentToolCallPart;
  surface?: AgentToolSurface;
}) {
  const t = useTranslations("Agent.components");
  const { command, output } = executeFields(part);
  const commandStr = command;
  const status = part.status ?? undefined;
  const running = (status ?? "").toLowerCase() === "running";
  const background = isBackgroundToolCall(part);
  const failed = (status ?? "").toLowerCase() === "failed" || part.result?.type === "error";
  const title = preferredCollapsedToolTitle(part, t("terminalBlock.title"));

  return (
    <AgentToolCard
      variant="tool"
      surface={surface}
      body="panel"
      tone={failed ? "error" : "default"}
      icon={getToolKindIcon("execute")}
      title={title}
      titleTooltip={commandStr || title}
      status={status}
      shimmer={running && !background}
    >
      {commandStr ? (
        <AgentCommandLine
          command={commandStr}
          className={cn("px-3 pt-2.5", !output && "pb-2.5")}
        />
      ) : null}
      {output ? (
        <div className="max-h-96 overflow-y-auto">
          <AcpTerminal
            output={output}
            isStreaming={running}
            autoScroll={running}
            className="rounded-none border-0 bg-transparent text-inherit shadow-none"
          >
            <AcpTerminalContent
              className={cn(
                "max-h-none overflow-visible p-0 px-3 pb-2.5 text-[13px] leading-5",
                commandStr ? "pt-1" : "pt-2.5",
                failed ? "text-destructive" : "text-muted-foreground",
              )}
            />
          </AcpTerminal>
        </div>
      ) : commandStr ? null : (
        <AgentToolEmptyBody status={status} />
      )}
    </AgentToolCard>
  );
}
