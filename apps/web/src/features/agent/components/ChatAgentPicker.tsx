"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "@workspace/ui";
import { Bot, Check, ChevronDown, Lock } from "lucide-react";

import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type { RegistryAgent } from "@/api/ws-api";

export function ChatAgentPicker({
  agents,
  value,
  onChange,
  disabled = false,
  className,
  trigger,
  align = "start",
  header,
  authRequiredAgentIds = [],
}: {
  agents: readonly RegistryAgent[];
  value: string;
  onChange: (agentId: string) => void;
  disabled?: boolean;
  className?: string;
  trigger?: React.ReactNode;
  align?: "start" | "end";
  header?: React.ReactNode;
  authRequiredAgentIds?: readonly string[];
}) {
  const t = useTranslations("Agent.components");
  const [open, setOpen] = React.useState(false);
  const selected = agents.find((agent) => agent.id === value) ?? null;
  const emptyLabel = t("selector.selectAgent");

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            disabled={disabled || agents.length === 0}
            aria-label={emptyLabel}
            className={cn(
              "inline-flex h-9 w-full items-center gap-2 rounded-md bg-background px-2.5 text-sm text-foreground hover:bg-muted",
              className,
            )}
          >
            {selected ? (
              <AgentIcon
                registryId={selected.id}
                name={selected.name}
                size={16}
                isCustom={selected.install_method === "custom"}
                registryIcon={selected.icon}
              />
            ) : (
              <Bot className="size-4 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate text-left">
              {selected?.name ?? emptyLabel}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64 p-1">
        {header === undefined ? (
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {t("historySidebar.agentForNewSession")}
          </div>
        ) : (
          header
        )}
        <div className="max-h-64 overflow-y-auto">
          {agents.map((agent) => {
            const isSelected = agent.id === value;
            const needsAuth = authRequiredAgentIds.includes(agent.id);
            return (
              <DropdownMenuItem
                key={agent.id}
                className="cursor-pointer"
                onSelect={() => onChange(agent.id)}
              >
                <span className="relative inline-flex">
                  <AgentIcon
                    registryId={agent.id}
                    name={agent.name}
                    size={16}
                    isCustom={agent.install_method === "custom"}
                    registryIcon={agent.icon}
                  />
                  {needsAuth ? (
                    <Lock
                      className="absolute -right-0.5 -bottom-0.5 size-2.5 text-muted-foreground"
                      data-agent-auth-required=""
                      aria-hidden
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                {needsAuth ? (
                  <Lock className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                ) : null}
                {isSelected ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
              </DropdownMenuItem>
            );
          })}
          {agents.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              {t("historySidebar.noInstalledAgent")}
            </div>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
