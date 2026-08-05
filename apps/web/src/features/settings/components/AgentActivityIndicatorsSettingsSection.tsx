"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@workspace/ui";
import { Activity, Bot, ChevronDown, Terminal as TerminalIcon } from "lucide-react";
import { AgentHookStatusIndicator } from "@/features/agent/components/AgentHookStatusIndicator";
import { AgentRunningGlyph } from "@/features/agent/components/AgentRunningGlyph";
import { AGENT_STATE } from "@/features/agent/store/agent-hooks-store";
import {
  INDICATOR_PLACEMENTS,
  INDICATOR_STYLE_GROUPS,
  type AgentActivityIndicatorId,
  type AgentIndicatorPlacement,
  type IndicatorFamily,
} from "@/features/agent/lib/agent-activity-indicator-styles";
import { useAgentActivityIndicatorSettingsStore } from "@/features/settings/store/agent-activity-indicator-settings-store";

function familyLabelKey(family: IndicatorFamily): string {
  return `families.${family}`;
}

function placementTitleKey(placement: AgentIndicatorPlacement): string {
  return `placements.${placement}.title`;
}

function placementDescriptionKey(placement: AgentIndicatorPlacement): string {
  return `placements.${placement}.description`;
}

/** 1:1 mock of left-sidebar project/workspace row trailing indicator. */
function LeftSidebarMockPreview({ styleId }: { styleId: AgentActivityIndicatorId }) {
  return (
    <div className="flex min-w-0 max-w-[200px] items-center gap-1.5 rounded-md border border-border/60 bg-sidebar px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-sidebar-foreground">
        atmos
      </span>
      <AgentHookStatusIndicator
        state={AGENT_STATE.RUNNING}
        variant="compact"
        styleId={styleId}
        className="shrink-0"
      />
    </div>
  );
}

/** 1:1 mock of center-stage terminal tab content (icon + title + compact indicator). */
function CenterTerminalMockPreview({ styleId }: { styleId: AgentActivityIndicatorId }) {
  return (
    <div className="flex min-w-0 max-w-[220px] items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5">
      <Bot className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium whitespace-nowrap">
        claude
      </span>
      <AgentHookStatusIndicator
        state={AGENT_STATE.RUNNING}
        variant="compact"
        styleId={styleId}
        className="ml-0.5 shrink-0"
      />
    </div>
  );
}

/** 1:1 mock of terminal mosaic pane toolbar full agent status. */
function TerminalPanelMockPreview({ styleId }: { styleId: AgentActivityIndicatorId }) {
  return (
    <div className="flex min-w-0 max-w-[260px] items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5">
      <TerminalIcon className="size-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">pane</span>
      <AgentHookStatusIndicator
        state={AGENT_STATE.RUNNING}
        variant="full"
        styleId={styleId}
        className="shrink-0"
      />
    </div>
  );
}

/** 1:1 mock of footer agent status ticker button. */
function FooterMockPreview({ styleId }: { styleId: AgentActivityIndicatorId }) {
  return (
    <div className="flex min-w-0 max-w-[240px] items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
      <AgentHookStatusIndicator
        state={AGENT_STATE.RUNNING}
        variant="compact"
        styleId={styleId}
      />
      <span className="font-medium whitespace-nowrap text-foreground">
        atmos
        <span className="mx-0.5 text-muted-foreground">-</span>
        <span>main</span>
      </span>
    </div>
  );
}

function PlacementMockPreview({
  placement,
  styleId,
}: {
  placement: AgentIndicatorPlacement;
  styleId: AgentActivityIndicatorId;
}) {
  switch (placement) {
    case "left_sidebar":
      return <LeftSidebarMockPreview styleId={styleId} />;
    case "center_terminal":
      return <CenterTerminalMockPreview styleId={styleId} />;
    case "terminal_panel":
      return <TerminalPanelMockPreview styleId={styleId} />;
    case "footer":
      return <FooterMockPreview styleId={styleId} />;
  }
}

function IndicatorStylePicker({
  value,
  onChange,
  disabled,
}: {
  value: AgentActivityIndicatorId;
  onChange: (id: AgentActivityIndicatorId) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("settings.codeAgentSection.activityIndicators");

  return (
    <div className="space-y-4 pt-3">
      {INDICATOR_STYLE_GROUPS.map((group) => (
        <div key={group.family}>
          <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {t(familyLabelKey(group.family) as never)}
          </p>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 md:grid-cols-8">
            {group.options.map((option) => {
              const selected = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  title={option.label}
                  onClick={() => onChange(option.id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border px-1.5 py-2 transition-colors",
                    "cursor-pointer hover:bg-accent/50",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/70 bg-background",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="flex h-7 w-full items-center justify-center">
                    <AgentRunningGlyph
                      // Remount when id changes so "random" re-rolls only on select.
                      key={option.id}
                      styleId={option.id}
                      density="compact"
                    />
                  </span>
                  <span className="max-w-full truncate text-[10px] text-muted-foreground">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlacementRow({
  placement,
  open,
  onOpenChange,
}: {
  placement: AgentIndicatorPlacement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings.codeAgentSection.activityIndicators");
  const styleId = useAgentActivityIndicatorSettingsStore((s) => s[placement]);
  const syncingPlacement = useAgentActivityIndicatorSettingsStore((s) => s.syncingPlacement);
  const setIndicator = useAgentActivityIndicatorSettingsStore((s) => s.setIndicator);
  const disabled = syncingPlacement === placement;

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="border-b border-border px-2 py-4 last:border-b-0"
    >
      <div className="flex items-center gap-3">
        <CollapsibleTrigger className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
          <span className="relative size-5 shrink-0">
            <Activity className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
            <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {t(placementTitleKey(placement) as never)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(placementDescriptionKey(placement) as never)}
            </p>
          </div>
        </CollapsibleTrigger>

        <div className="shrink-0">
          <PlacementMockPreview placement={placement} styleId={styleId} />
        </div>
      </div>

      <CollapsibleContent>
        <IndicatorStylePicker
          value={styleId}
          disabled={disabled}
          onChange={(id) => {
            void setIndicator(placement, id).catch(() => {
              // store rolls back; no toast per product preference for local settings
            });
          }}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AgentActivityIndicatorsSettingsSection() {
  const t = useTranslations("settings.codeAgentSection.activityIndicators");
  const loadSettings = useAgentActivityIndicatorSettingsStore((s) => s.loadSettings);
  const [openPlacement, setOpenPlacement] = useState<AgentIndicatorPlacement | null>(null);
  const [sectionOpen, setSectionOpen] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return (
    <Collapsible
      open={sectionOpen}
      onOpenChange={setSectionOpen}
      className="overflow-hidden rounded-2xl border border-border"
    >
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 size-5 shrink-0">
              <Activity className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
              <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">{t("title")}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("description")}</p>
            </div>
          </div>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="border-t border-border px-4">
          {INDICATOR_PLACEMENTS.map((placement) => (
            <PlacementRow
              key={placement}
              placement={placement}
              open={openPlacement === placement}
              onOpenChange={(open) => setOpenPlacement(open ? placement : null)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
