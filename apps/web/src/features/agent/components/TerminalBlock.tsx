"use client";

import { useTranslations } from "next-intl";
import {
  AcpTerminal,
  AcpTerminalContent,
} from "@workspace/ui";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { getTerminalCommandString, getToolKindIcon } from "../lib/chat-helpers";
import {
  extractOutputText,
  unwrapVendorToolEnvelope,
} from "../lib/tool-results/parse-tool-result";
import { AgentToolCard } from "./tool-results/AgentToolCard";
import { AgentToolCopyAction, AgentToolEmptyBody } from "./tool-results/AgentToolBodies";

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

export function TerminalBlock({ part }: { part: AgentToolCallPart }) {
  const t = useTranslations("Agent.components");
  const commandStr = terminalCommand(part.input, part.output);
  const output = terminalOutput(part.output);
  const status = part.status ?? undefined;
  const running = (status ?? "").toLowerCase() === "running";
  const failed = (status ?? "").toLowerCase() === "failed";
  const title = commandStr
    ? `${t("terminalBlock.title")}: ${collapsedCommand(commandStr)}`
    : t("terminalBlock.title");
  const copyText = [commandStr && `$ ${commandStr}`, output].filter(Boolean).join("\n");

  return (
    <AgentToolCard
      variant="tool"
      tone={failed ? "error" : "default"}
      icon={getToolKindIcon("execute")}
      title={title}
      titleTooltip={commandStr || title}
      status={status}
      actions={copyText ? <AgentToolCopyAction text={copyText} /> : undefined}
    >
      {commandStr ? (
        <div className="flex items-start gap-2 border-b border-border/40 px-3 py-2 font-mono text-[12px] text-foreground/80">
          <span className="shrink-0 text-emerald-600 dark:text-emerald-400">$</span>
          <span className="min-w-0 whitespace-pre-wrap break-all">{commandStr}</span>
        </div>
      ) : null}
      {output ? (
        <AcpTerminal
          output={output}
          isStreaming={running}
          autoScroll={running}
          className="rounded-none border-0 bg-transparent text-inherit shadow-none"
        >
          <AcpTerminalContent className="max-h-96 px-3 py-2 text-[13px] text-foreground" />
        </AcpTerminal>
      ) : (
        <AgentToolEmptyBody status={status} />
      )}
    </AgentToolCard>
  );
}
