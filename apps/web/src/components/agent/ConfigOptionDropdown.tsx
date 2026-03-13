"use client";

import React, { useState } from "react";
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
} from "@workspace/ui";
import type { AgentConfigOption } from "@/hooks/use-agent-session";
import type { RegistryAgent } from "@/api/ws-api";

export function ConfigOptionDropdown({
  opt,
  registryId,
  activeAgent,
  setConfigOption,
  setAgentDefaultConfig,
  setInstalledAgents,
}: {
  opt: AgentConfigOption;
  registryId: string;
  activeAgent: RegistryAgent | null;
  setConfigOption: (id: string, val: string) => void;
  setAgentDefaultConfig: (id: string, val: string) => void;
  setInstalledAgents: React.Dispatch<React.SetStateAction<RegistryAgent[]>>;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filteredOptions = opt.options.filter(o => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (o.name || o.value).toLowerCase().includes(s) || o.value.toLowerCase().includes(s);
  });

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
        <SelectTrigger className="h-8 text-xs min-w-[100px] border-border/50 bg-muted/20">
          <SelectValue placeholder={opt.name || opt.id} />
        </SelectTrigger>
        <SelectContent>
          {opt.options.length > 15 && (
            <div className="p-1.5 border-b border-border/50 sticky top-0 bg-popover z-10 mb-1">
              <input
                className="w-full bg-transparent text-xs px-2 py-1 outline-none placeholder:text-muted-foreground/50 border border-border/50 rounded focus:border-ring"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                autoFocus
              />
            </div>
          )}
          {filteredOptions.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground text-center">No results</div>
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
                          Shift + Click to set as default {isDefault ? "(current default)" : ""}
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
