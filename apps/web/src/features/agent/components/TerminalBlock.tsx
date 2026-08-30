"use client";

import { useTranslations } from "next-intl";
import {
  AcpTerminal,
  AcpTerminalContent,
} from "@workspace/ui";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { getTerminalCommandString, getToolKindIcon } from "../lib/chat-helpers";
import { isGenericToolLabel } from "../lib/agent-tool-kind";
import {
  extractOutputText,
  unwrapVendorToolEnvelope,
} from "../lib/tool-results/parse-tool-result";
import { AgentToolCard, type AgentToolSurface } from "./tool-results/AgentToolCard";
import { AgentToolEmptyBody } from "./tool-results/AgentToolBodies";
import { AgentCommandLine } from "./AgentCommandLine";
import { cn } from "@/shared/lib/utils";

function terminalCommand(rawInput: unknown, rawOutput: unknown): string {
  return (
    getTerminalCommandString(rawInput)
    || getTerminalCommandString(rawOutput)
    || getTerminalCommandString(unwrapVendorToolEnvelope(rawOutput)?.payload)
    || ""
  );
}

function terminalOutput(rawOutput: unknown): string {
  return (
    extractOutputText(rawOutput)
    ?? extractOutputText(unwrapVendorToolEnvelope(rawOutput)?.payload)
    ?? ""
  );
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
  const commandStr = terminalCommand(part.input, part.output)
    || (part.title && !isGenericToolLabel(part.title) ? part.title : "");
  const output = terminalOutput(part.output);
  const status = part.status ?? undefined;
  const running = (status ?? "").toLowerCase() === "running";
  const failed = (status ?? "").toLowerCase() === "failed";
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
    >
      {commandStr || output ? (
        <div className="max-h-96 overflow-y-auto">
          {commandStr ? (
            <AgentCommandLine
              command={commandStr}
              className={cn("px-3 pt-2.5", !output && "pb-2.5")}
            />
          ) : null}
          {output ? (
            <AcpTerminal
              output={output}
              isStreaming={running}
              autoScroll={running}
              className="rounded-none border-0 bg-transparent text-inherit shadow-none"
            >
              <AcpTerminalContent
                className={cn(
                  "max-h-none overflow-visible p-0 px-3 pb-2.5 pt-1 text-[13px] leading-5",
                  failed ? "text-destructive" : "text-muted-foreground",
                  !commandStr && "pt-2.5",
                )}
              />
            </AcpTerminal>
          ) : null}
        </div>
      ) : (
        <AgentToolEmptyBody status={status} />
      )}
    </AgentToolCard>
  );
}
