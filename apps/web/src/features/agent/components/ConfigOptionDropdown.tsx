"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";
import type { AgentConfigOption } from "@/features/agent/hooks/use-agent-session";
import type { RegistryAgent } from "@/api/ws-api";

export function ConfigOptionDropdown({
  opt,
  registryId,
  activeAgent,
  setConfigOption,
  setAgentDefaultConfig,
  setInstalledAgents,
  icon,
  triggerClassName,
}: {
  opt: AgentConfigOption;
  registryId: string;
  activeAgent: RegistryAgent | null;
  setConfigOption: (id: string, val: string) => void;
  setAgentDefaultConfig: (id: string, val: string) => void;
  setInstalledAgents: React.Dispatch<React.SetStateAction<RegistryAgent[]>>;
  icon?: React.ReactNode;
  triggerClassName?: string;
}) {
  const t = useTranslations("Agent.components");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filteredOptions = opt.options.filter(o => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (o.name || o.value).toLowerCase().includes(s) || o.value.toLowerCase().includes(s);
  });
  const showSearch = opt.options.length > 15;

  return (
    <div className="flex items-center gap-1">
      <Select
        open={open}
        value={opt.currentValue || ''}
        onValueChange={(val) => {
          setConfigOption(opt.id, val);
          setOpen(false);
          setSearch("");
        }}
        onOpenChange={(open) => {
          setOpen(open);
          if (!open) setSearch("");
        }}
      >
        <SelectTrigger className={cn("h-8 w-auto min-w-0 gap-1.5 border-0 bg-transparent px-2 text-xs shadow-none hover:bg-muted/60 dark:bg-transparent dark:hover:bg-muted/60 data-[state=open]:bg-muted/60 dark:data-[state=open]:bg-muted/60", triggerClassName)}>
          {icon}
          <SelectValue placeholder={opt.name || opt.id} />
        </SelectTrigger>
        <SelectContent
          className="max-h-[min(20rem,var(--radix-select-content-available-height))]"
          header={
            showSearch ? (
              <div className="border-b border-border/50 p-1.5">
                <input
                  className="w-full rounded border border-border/50 bg-transparent px-2 py-1 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-ring"
                  placeholder={t("configOptionDropdown.searchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  autoFocus
                />
              </div>
            ) : null
          }
        >
          {filteredOptions.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground text-center">{t("configOptionDropdown.noResults")}</div>
          ) : (
            filteredOptions.map(o => {
              const isDefault = activeAgent?.default_config?.[opt.id] === o.value;
              const item = (
                <SelectItem
                  key={o.value}
                  value={o.value}
                  className="text-xs"
                  onPointerDown={(e) => {
                    if (!e.shiftKey) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setConfigOption(opt.id, o.value);
                    setAgentDefaultConfig(opt.id, o.value);
                    setInstalledAgents((prev) =>
                      prev.map((a) => {
                        if (a.id === registryId) {
                          return {
                            ...a,
                            default_config: {
                              ...(a.default_config || {}),
                              [opt.id]: o.value,
                            },
                          };
                        }
                        return a;
                      })
                    );
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <span className="truncate">{o.name || o.value}</span>
                </SelectItem>
              );
              return (
                <TooltipProvider key={o.value} delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>{item}</TooltipTrigger>
                    <TooltipContent side="left" align="center" className="z-100 max-w-[250px]">
                      <div className="space-y-1.5">
                        {o.description ? <div>{o.description}</div> : null}
                        <div className="border-t border-border/50 pt-1 text-[10px]">
                          {isDefault
                            ? t("configOptionDropdown.shiftClickDefaultCurrent")
                            : t("configOptionDropdown.shiftClickDefault")}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
