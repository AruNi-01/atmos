"use client";

import { useEffect, useState } from "react";
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
import { highlight, DualThemes } from "@/shared/utils/shiki";
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

function CommandHighlight({ code }: { code: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    highlight()
      .then((highlighter) => {
        if (cancelled) return;
        setHtml(
          highlighter.codeToHtml(code, {
            lang: "bash",
            themes: DualThemes,
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (html) {
    return (
      <div
        className={cn(
          "min-w-0 flex-1 overflow-x-auto",
          // globals.css `pre.shiki span.line` padding is unlayered; ! is required to sit flush with `$`.
          "[&_pre.shiki]:!m-0 [&_pre.shiki]:!bg-transparent [&_pre.shiki]:!p-0",
          "[&_pre.shiki_code]:block [&_pre.shiki_code]:text-[13px] [&_pre.shiki_code]:leading-5",
          "[&_pre.shiki_span.line]:!block [&_pre.shiki_span.line]:!p-0",
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <code className="min-w-0 flex-1 whitespace-pre-wrap break-all text-[13px] leading-5 text-foreground">
      {code}
    </code>
  );
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
            <div className={cn("flex items-start px-3 pt-2.5 font-mono text-[13px] leading-5", !output && "pb-2.5")}>
              <span className="shrink-0 select-none pr-[1ch] text-muted-foreground">
                $
              </span>
              <CommandHighlight code={commandStr} />
            </div>
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
