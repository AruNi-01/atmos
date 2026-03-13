"use client";

import React from "react";
import {
  AcpTerminal,
  AcpTerminalHeader,
  AcpTerminalTitle,
  AcpTerminalStatus,
  AcpTerminalActions,
  AcpTerminalCopyButton,
  AcpTerminalContent,
} from "@workspace/ui";
import type { ToolCallBlock } from "@/lib/agent/thread";
import { toolStatusToState, getTerminalCommandString } from "./chat-helpers";
import { CommandCopyButton } from "./CopyButtons";

export function TerminalBlock({
  tool,
  description,
  status,
  raw_input,
  raw_output,
}: ToolCallBlock) {
  const state = toolStatusToState(status);
  const isRunning = state === "input-available";
  const isError = state === "output-error";
  const commandStr = getTerminalCommandString(raw_input);

  const terminalOutput = (() => {
    if (raw_output === undefined || raw_output === null) return "";
    if (typeof raw_output === "string") return raw_output;
    if (typeof raw_output === "object") {
      const o = raw_output as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of ["output", "stdout", "content", "result", "text"]) {
        if (typeof o[key] === "string" && o[key]) parts.push(o[key] as string);
      }
      if (typeof o["stderr"] === "string" && o["stderr"]) {
        parts.push(o["stderr"] as string);
      }
      if (parts.length > 0) return parts.join("\n");
      return JSON.stringify(raw_output, null, 2);
    }
    return String(raw_output);
  })();

  return (
    <AcpTerminal
      output={terminalOutput}
      isStreaming={isRunning}
      autoScroll
      className={isError ? "border-red-500/50 w-full" : "w-full"}
    >
      <AcpTerminalHeader>
        <AcpTerminalTitle>Run Script</AcpTerminalTitle>
        <div className="flex items-center gap-1">
          <AcpTerminalStatus />
          <AcpTerminalActions>
            <AcpTerminalCopyButton />
          </AcpTerminalActions>
        </div>
      </AcpTerminalHeader>
      {commandStr && (
        <div className="flex items-center border-b border-zinc-800">
          <div className="flex-1 min-w-0 overflow-x-auto px-4 py-2 font-mono text-sm text-zinc-300">
            <span className="whitespace-nowrap"><span className="text-green-400">$</span> {commandStr}</span>
          </div>
          <CommandCopyButton text={commandStr} />
        </div>
      )}
      <AcpTerminalContent className="max-h-60" />
    </AcpTerminal>
  );
}
