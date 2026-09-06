"use client";

import { useTranslations } from "next-intl";
import {
  AcpTerminal,
  AcpTerminalContent,
} from "@workspace/ui";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { getToolKindIcon } from "../lib/chat-helpers";
import { isBackgroundToolCall } from "../lib/agent/background-command";
import { isGenericToolLabel } from "../lib/agent-tool-kind";
import { AgentToolCard, type AgentToolSurface } from "./tool-results/AgentToolCard";
import { AgentToolEmptyBody } from "./tool-results/AgentToolBodies";
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

function collapsedCommand(command: string): string {
  return command.replace(/\s+/g, " ").trim();
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
  const commandStr = command || (part.title && !isGenericToolLabel(part.title) ? part.title : "");
  const status = part.status ?? undefined;
  const running = (status ?? "").toLowerCase() === "running";
  const background = isBackgroundToolCall(part);
  const failed = (status ?? "").toLowerCase() === "failed" || part.result?.type === "error";
  const title = commandStr
    ? `${t("terminalBlock.title")}: ${collapsedCommand(commandStr)}`
    : t("terminalBlock.title");

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
                "max-h-none overflow-visible p-0 px-3 py-2.5 text-[13px] leading-5",
                failed ? "text-destructive" : "text-muted-foreground",
              )}
            />
          </AcpTerminal>
        </div>
      ) : (
        <AgentToolEmptyBody status={status} />
      )}
    </AgentToolCard>
  );
}
