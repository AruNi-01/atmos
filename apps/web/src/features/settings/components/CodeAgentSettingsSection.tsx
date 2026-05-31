"use client";

import React from "react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Skeleton,
  Switch,
} from "@workspace/ui";
import { Bot, ChevronDown, LoaderCircle, Package, Plus, Trash2, UserCog } from "lucide-react";
import { AGENT_OPTIONS, getInteractiveAgentParams } from "@/features/wiki/components/AgentSelect";
import { AgentIcon } from "@/features/agent/components/AgentIcon";
import type { CodeAgentCustomEntry } from "@/api/ws-api";
import { AgentHookStatusCard } from "@/features/settings/components/AgentHookStatusCard";
import { SaveActionButton } from "@/features/settings/components/settings/SaveActionButton";

type BuiltInAgentSettings = Record<string, { cmd?: string; flags?: string; enabled?: boolean }>;

interface CodeAgentSettingsSectionProps {
  agentCustomSettings: BuiltInAgentSettings;
  agentSettingsLoading: boolean;
  builtInAgentOpen: Record<string, boolean>;
  builtInAgentsExpanded: boolean;
  customAgentOpen: Record<string, boolean>;
  customAgents: CodeAgentCustomEntry[];
  customAgentsExpanded: boolean;
  idleSessionTimeoutMins: number;
  removingCustomAgentIds: Record<string, boolean>;
  savedAgentCustomSettings: BuiltInAgentSettings;
  savedCustomAgents: CodeAgentCustomEntry[];
  savedIdleSessionTimeoutMins: number;
  savingBuiltInAgentIds: Record<string, boolean>;
  savingCustomAgentIds: Record<string, boolean>;
  savingIdleTimeout: boolean;
  syncingBuiltInEnabledIds: Record<string, boolean>;
  syncingCustomEnabledIds: Record<string, boolean>;
  onAddCustomAgent: () => void;
  onAgentSettingChange: (agentId: string, field: "cmd" | "flags" | "enabled", value: string | boolean) => void;
  onBuiltInEnabledChange: (agentId: string, enabled: boolean) => void;
  onCustomAgentChange: (id: string, field: keyof CodeAgentCustomEntry, value: string | boolean) => void;
  onCustomAgentEnabledChange: (id: string, enabled: boolean) => void;
  onRemoveCustomAgent: (id: string) => void;
  onSaveBuiltInAgent: (agentId: string) => void;
  onSaveCustomAgent: (id: string) => void;
  onSaveIdleTimeout: () => void;
  setBuiltInAgentOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setBuiltInAgentsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setCustomAgentOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setCustomAgentsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setIdleSessionTimeoutMins: React.Dispatch<React.SetStateAction<number>>;
}

export function CodeAgentSettingsSection({
  agentCustomSettings,
  agentSettingsLoading,
  builtInAgentOpen,
  builtInAgentsExpanded,
  customAgentOpen,
  customAgents,
  customAgentsExpanded,
  idleSessionTimeoutMins,
  removingCustomAgentIds,
  savedAgentCustomSettings,
  savedCustomAgents,
  savedIdleSessionTimeoutMins,
  savingBuiltInAgentIds,
  savingCustomAgentIds,
  savingIdleTimeout,
  syncingBuiltInEnabledIds,
  syncingCustomEnabledIds,
  onAddCustomAgent,
  onAgentSettingChange,
  onBuiltInEnabledChange,
  onCustomAgentChange,
  onCustomAgentEnabledChange,
  onRemoveCustomAgent,
  onSaveBuiltInAgent,
  onSaveCustomAgent,
  onSaveIdleTimeout,
  setBuiltInAgentOpen,
  setBuiltInAgentsExpanded,
  setCustomAgentOpen,
  setCustomAgentsExpanded,
  setIdleSessionTimeoutMins,
}: CodeAgentSettingsSectionProps) {
  return (
    <div className="space-y-4">
      <Collapsible
        open={builtInAgentsExpanded}
        onOpenChange={setBuiltInAgentsExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 size-5 shrink-0">
                <Package className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground">Built-in Agents</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Customize the startup command and parameters for each built-in code agent.
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          {agentSettingsLoading ? (
            <div className="space-y-3 border-t border-border px-6 py-4">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : (
            <div className="border-t border-border px-4">
              {AGENT_OPTIONS.map((agent) => {
                const custom = agentCustomSettings[agent.id];
                const isOpen = builtInAgentOpen[agent.id] ?? false;
                const savedAgent = savedAgentCustomSettings[agent.id];
                const isDirty =
                  (savedAgent?.cmd ?? agent.cmd) !== (custom?.cmd ?? agent.cmd) ||
                  (savedAgent?.flags ?? (agent.params || "")) !== (custom?.flags ?? (agent.params || ""));
                const isSaving = !!savingBuiltInAgentIds[agent.id];
                const isSyncingEnabled = !!syncingBuiltInEnabledIds[agent.id];
                const enabled = custom?.enabled ?? true;
                const summary = [
                  custom?.cmd ?? agent.cmd,
                  getInteractiveAgentParams(agent, custom?.flags),
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <Collapsible
                    key={agent.id}
                    open={isOpen}
                    onOpenChange={(open) => setBuiltInAgentOpen((prev) => ({ ...prev, [agent.id]: open }))}
                    className="border-b border-border px-2 py-4 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <CollapsibleTrigger className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                        <span className="relative size-5 shrink-0">
                          <span className="absolute inset-0 transition-opacity duration-150 group-hover:opacity-0">
                            <AgentIcon registryId={agent.id} name={agent.label} size={20} />
                          </span>
                          <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{agent.label}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {summary || "No parameters"}
                          </p>
                        </div>
                      </CollapsibleTrigger>

                      <div className="flex items-center gap-3">
                        {(isDirty || isSaving) && (
                          <SaveActionButton saving={isSaving} onClick={() => onSaveBuiltInAgent(agent.id)} />
                        )}
                        <Switch
                          checked={enabled}
                          disabled={isSyncingEnabled}
                          onCheckedChange={(checked) => onBuiltInEnabledChange(agent.id, !!checked)}
                        />
                      </div>
                    </div>

                    <CollapsibleContent>
                      <div className="grid grid-cols-2 gap-3 pt-4">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Command</label>
                          <Input
                            value={custom?.cmd ?? agent.cmd}
                            placeholder={agent.cmd}
                            onChange={(event) => onAgentSettingChange(agent.id, "cmd", event.target.value)}
                            className="h-9 text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Parameters</label>
                          <Input
                            value={custom?.flags ?? (agent.params || "")}
                            placeholder={agent.params || "No default parameters"}
                            onChange={(event) => onAgentSettingChange(agent.id, "flags", event.target.value)}
                            className="h-9 text-sm font-mono"
                          />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={customAgentsExpanded}
        onOpenChange={setCustomAgentsExpanded}
        className="overflow-hidden rounded-2xl border border-border"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 size-5 shrink-0">
                <UserCog className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-medium text-foreground">Custom Agents</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Add your own agents with custom commands and parameters.
                </p>
              </div>
            </div>
          </CollapsibleTrigger>
          <Button variant="outline" onClick={onAddCustomAgent}>
            <Plus className="mr-2 size-4" />
            Add Agent
          </Button>
        </div>

        <CollapsibleContent>
          {customAgents.length === 0 ? (
            <div className="border-t border-border px-6 py-5 text-sm text-muted-foreground">
              No custom agents configured yet. Click &quot;Add Agent&quot; to create one.
            </div>
          ) : (
            <div className="border-t border-border px-4">
              {customAgents.map((agent) => {
                const isOpen = customAgentOpen[agent.id] ?? false;
                const savedAgent = savedCustomAgents.find((item) => item.id === agent.id);
                const isDirty =
                  !savedAgent ||
                  savedAgent.label !== agent.label ||
                  savedAgent.cmd !== agent.cmd ||
                  savedAgent.flags !== agent.flags;
                const isSaving = !!savingCustomAgentIds[agent.id];
                const isSyncingEnabled = !!syncingCustomEnabledIds[agent.id];
                const isRemoving = !!removingCustomAgentIds[agent.id];
                const enabled = agent.enabled !== false;
                const summary = [agent.cmd, agent.flags].filter(Boolean).join(" ");

                return (
                  <Collapsible
                    key={agent.id}
                    open={isOpen}
                    onOpenChange={(open) => setCustomAgentOpen((prev) => ({ ...prev, [agent.id]: open }))}
                    className="border-b border-border px-2 py-4 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <CollapsibleTrigger className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                        <span className="relative size-5 shrink-0">
                          <Bot className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
                          <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {agent.label || "New Agent"}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {summary || "No parameters"}
                          </p>
                        </div>
                      </CollapsibleTrigger>

                      <div className="flex items-center gap-3">
                        {(isDirty || isSaving) && (
                          <SaveActionButton saving={isSaving} onClick={() => onSaveCustomAgent(agent.id)} />
                        )}
                        <Switch
                          checked={enabled}
                          disabled={isSyncingEnabled}
                          onCheckedChange={(checked) => onCustomAgentEnabledChange(agent.id, !!checked)}
                        />
                      </div>
                      <button
                        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onRemoveCustomAgent(agent.id)}
                        title="Remove agent"
                        disabled={isRemoving}
                      >
                        {isRemoving ? (
                          <LoaderCircle className="size-4 animate-spin-reverse" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </button>
                    </div>

                    <CollapsibleContent>
                      <div className="space-y-3 pt-4">
                        <div>
                          <label className="mb-1 block text-xs text-muted-foreground">Name</label>
                          <Input
                            value={agent.label}
                            placeholder="Agent name"
                            onChange={(event) => onCustomAgentChange(agent.id, "label", event.target.value)}
                            className="h-9 text-sm font-medium"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Command</label>
                            <Input
                              value={agent.cmd}
                              placeholder="e.g. my-agent"
                              onChange={(event) => onCustomAgentChange(agent.id, "cmd", event.target.value)}
                              className="h-9 text-sm font-mono"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Parameters</label>
                            <Input
                              value={agent.flags}
                              placeholder="e.g. --yolo"
                              onChange={(event) => onCustomAgentChange(agent.id, "flags", event.target.value)}
                              className="h-9 text-sm font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <AgentHookStatusCard />

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="flex items-start justify-between gap-4 px-6 py-5">
          <div className="min-w-0">
            <p className="text-base font-medium text-foreground">Behaviour</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Configure how idle agent sessions are managed in memory.
            </p>
          </div>
        </div>
        <div className="border-t border-border px-6 py-5">
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Idle session cleanup</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Idle agent sessions older than this duration are automatically removed every 5 minutes.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1440}
                value={idleSessionTimeoutMins}
                onChange={(event) => setIdleSessionTimeoutMins(Math.max(1, Number(event.target.value)))}
                className="h-8 w-20 text-center text-sm"
              />
              <span className="text-sm text-muted-foreground whitespace-nowrap">min</span>
              {idleSessionTimeoutMins !== savedIdleSessionTimeoutMins ? (
                <Button size="sm" disabled={savingIdleTimeout} onClick={onSaveIdleTimeout}>
                  {savingIdleTimeout ? <LoaderCircle className="size-3.5 animate-spin-reverse" /> : "Save"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
