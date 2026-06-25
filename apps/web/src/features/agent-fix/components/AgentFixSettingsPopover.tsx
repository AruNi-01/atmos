"use client";

import React from "react";
import { Settings2 } from "lucide-react";
import { cn } from "@workspace/ui";
import { TerminalAgentSelectorWithRunConfig } from "@/features/agent/components/TerminalAgentSelectorWithRunConfig";
import type { AgentFixAgentOption } from "@/features/agent-fix/types";
import type { TerminalAgentRunConfigInput } from "@/features/agent/lib/terminal-agent-run-config";

export function AgentFixSettingsPopover({
  agents,
  className,
  disabled,
  onCloseAutoFocus,
  onOpenChange,
  onPointerDownOutside,
  onRunConfigChange,
  onSelectedAgentChange,
  open,
  runConfig,
  runConfigByAgentId,
  selectedAgentId,
  triggerRef,
}: {
  agents: AgentFixAgentOption[];
  className?: string;
  disabled?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
  onOpenChange?: (open: boolean) => void;
  onPointerDownOutside?: (event: Event) => void;
  onRunConfigChange: (agentId: string, value: TerminalAgentRunConfigInput | null) => void;
  onSelectedAgentChange: (agentId: string) => void;
  open?: boolean;
  runConfig: TerminalAgentRunConfigInput | null;
  runConfigByAgentId: Record<string, TerminalAgentRunConfigInput | null | undefined>;
  selectedAgentId: string;
  triggerRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <TerminalAgentSelectorWithRunConfig
      variant="menu"
      options={agents}
      value={selectedAgentId}
      onValueChange={onSelectedAgentChange}
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      onPointerDownOutside={onPointerDownOutside}
      runConfig={runConfig}
      runConfigByAgentId={runConfigByAgentId}
      onRunConfigChange={onRunConfigChange}
      purpose="interactive"
      trigger={
        <button
          type="button"
          ref={triggerRef}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground transition-colors duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          aria-label="Configure Agent Fix agent"
          title="Configure Agent Fix agent"
        >
          <Settings2 className="size-3.5" />
        </button>
      }
    />
  );
}
