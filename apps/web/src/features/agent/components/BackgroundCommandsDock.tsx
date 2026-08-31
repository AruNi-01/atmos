"use client";

import { useTranslations } from "next-intl";
import { Terminal } from "lucide-react";
import {
  AcpTerminal,
  AcpTerminalContent,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui";
import type { AgentToolCallPart } from "@/features/agent/lib/agent-tool-kind";
import { displayBackgroundCommand } from "@/features/agent/lib/agent/background-command";
import { getTerminalCommandString } from "@/features/agent/lib/chat-helpers";
import {
  extractOutputText,
  unwrapVendorToolEnvelope,
} from "@/features/agent/lib/tool-results/parse-tool-result";
import { AgentCommandLine } from "./AgentCommandLine";
import { cn } from "@/shared/lib/utils";

function commandFor(part: AgentToolCallPart): string {
  return (
    getTerminalCommandString(part.input)
    || getTerminalCommandString(part.output)
    || getTerminalCommandString(unwrapVendorToolEnvelope(part.output)?.payload)
    || displayBackgroundCommand(part)
  );
}

function outputFor(part: AgentToolCallPart): string {
  return (
    extractOutputText(part.output)
    ?? extractOutputText(unwrapVendorToolEnvelope(part.output)?.payload)
    ?? ""
  );
}

function lastOutputLine(output: string): string {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? "";
}

export function BackgroundCommandsDock({
  tools,
}: {
  tools: AgentToolCallPart[];
}) {
  const t = useTranslations("Agent.components.backgroundCommands");
  if (tools.length === 0) return null;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-sm font-medium text-foreground/90">{t("title")}</span>
        <span className="text-xs text-muted-foreground">{t("runningCount", { count: tools.length })}</span>
      </div>
      <ul className="px-1.5 pb-1.5">
        {tools.map((part) => {
          const command = commandFor(part);
          const output = outputFor(part);
          const label = displayBackgroundCommand(part) || command;
          const preview = lastOutputLine(output);
          return (
            <li key={part.tool_call_id}>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted/50"
                    aria-label={t("commandAria")}
                  >
                    <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                      <Terminal className="size-3.5" />
                      <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-emerald-500" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">
                      {preview ? `${label} · ${preview}` : label}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{t("running")}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="top"
                  className="w-[min(32rem,calc(100vw-2rem))] overflow-hidden p-0"
                >
                  <div className="max-h-80 overflow-y-auto">
                    {command ? (
                      <AgentCommandLine
                        command={command}
                        className={cn("px-3 pt-2.5", !output && "pb-2.5")}
                      />
                    ) : null}
                    {output ? (
                      <AcpTerminal
                        output={output}
                        isStreaming
                        autoScroll
                        className="rounded-none border-0 bg-transparent text-inherit shadow-none"
                      >
                        <AcpTerminalContent
                          className={cn(
                            "max-h-none overflow-visible p-0 px-3 pb-2.5 pt-1 text-[13px] leading-5 text-muted-foreground",
                            !command && "pt-2.5",
                          )}
                        />
                      </AcpTerminal>
                    ) : (
                      <p className="px-3 py-2 text-xs text-muted-foreground">{t("emptyOutput")}</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
