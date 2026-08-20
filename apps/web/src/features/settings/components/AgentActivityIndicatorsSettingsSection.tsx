"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@workspace/ui";
import {
  AppWindow,
  Bot,
  ChevronDown,
  PanelBottom,
  PanelLeft,
  Terminal as TerminalIcon,
  type LucideIcon,
} from "lucide-react";
import { AgentHookStatusIndicator } from "@/features/agent/components/AgentHookStatusIndicator";
import { AgentRunningGlyph } from "@/features/agent/components/AgentRunningGlyph";
import { AGENT_STATE } from "@/features/agent/store/agent-hooks-store";
import {
  INDICATOR_PLACEMENTS,
  INDICATOR_STYLE_GROUPS,
  isOrbIndicatorId,
  type AgentActivityIndicatorId,
  type AgentIndicatorPlacement,
  type IndicatorFamily,
} from "@/features/agent/lib/agent-activity-indicator-styles";
import { useAgentActivityIndicatorSettingsStore } from "@/features/settings/store/agent-activity-indicator-settings-store";
import { SettingsGroupCard } from "@/features/settings/components/settings/SettingsGroupCard";

/** Picker Orbs need a slight bump so their sparse geometry matches unicode mono glyphs. */
const PICKER_ORB_SIZE = 22;

/** Row icons match each surface (not the section Activity glyph). */
const PLACEMENT_ICONS: Record<AgentIndicatorPlacement, LucideIcon> = {
  left_sidebar: PanelLeft,
  center_terminal: AppWindow,
  terminal_panel: TerminalIcon,
  footer: PanelBottom,
};

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

/** 1:1 mock of terminal pane toolbar full agent status. */
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

const PlacementMockPreview = React.memo(function PlacementMockPreview({
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
});

/** Matches `collapsible-down` / `collapsible-up` in packages/ui globals.css. */
const COLLAPSIBLE_ANIM_MS = 200;

function IndicatorStylePicker({
  value,
  onChange,
  busy,
  glyphsAnimated,
}: {
  value: AgentActivityIndicatorId;
  onChange: (id: AgentActivityIndicatorId) => void;
  /** True while a save is in flight — blocks double submits without dimming the grid. */
  busy?: boolean;
  /**
   * When false, freeze every tile (expand/collapse height tween in progress).
   * When true, run all previews so the user can compare motion at a glance.
   */
  glyphsAnimated: boolean;
}) {
  const t = useTranslations("settings.codeAgentSection.activityIndicators");

  return (
    <div className="space-y-4 pt-3">
      {INDICATOR_STYLE_GROUPS.map((group) => (
        <div key={group.family}>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t(familyLabelKey(group.family) as never)}
          </p>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 md:grid-cols-8">
            {group.options.map((option) => {
              const selected = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  aria-busy={busy && selected ? true : undefined}
                  title={option.label}
                  onClick={() => {
                    if (busy || option.id === value) return;
                    onChange(option.id);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border px-1.5 py-2 transition-[border-color,background-color,box-shadow] duration-150",
                    "cursor-pointer hover:bg-accent/50",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/70 bg-background",
                    busy && "cursor-wait",
                  )}
                >
                  <span className="flex h-7 w-full items-center justify-center">
                    <AgentRunningGlyph
                      // Remount when id changes so "random" re-rolls only on select.
                      key={option.id}
                      styleId={option.id}
                      density="compact"
                      animated={glyphsAnimated}
                      size={
                        isOrbIndicatorId(option.id) ? PICKER_ORB_SIZE : undefined
                      }
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
  const busy = syncingPlacement === placement;
  const PlacementIcon = PLACEMENT_ICONS[placement];
  // Keep height animation (same as other settings rows), but don't run ~36 live
  // glyphs until the collapsible tween finishes — that was the main expand jank.
  const [glyphsAnimated, setGlyphsAnimated] = useState(false);

  useEffect(() => {
    if (!open) {
      setGlyphsAnimated(false);
      return;
    }
    setGlyphsAnimated(false);
    // Fallback if animationend is skipped (reduced motion / interrupted toggle).
    const fallback = window.setTimeout(() => {
      setGlyphsAnimated(true);
    }, COLLAPSIBLE_ANIM_MS + 20);
    return () => window.clearTimeout(fallback);
  }, [open]);

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="border-b border-border/60 px-2 py-3 last:border-b-0"
    >
      <div className="flex items-center gap-3">
        <CollapsibleTrigger className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
          <PlacementIcon className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {t(placementTitleKey(placement) as never)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(placementDescriptionKey(placement) as never)}
            </p>
          </div>
        </CollapsibleTrigger>

        <div className="flex shrink-0 items-center gap-2">
          <PlacementMockPreview placement={placement} styleId={styleId} />
          <CollapsibleTrigger className="cursor-pointer text-muted-foreground">
            <ChevronDown
              className={cn(
                "size-4 transition-transform duration-150",
                !open && "-rotate-90",
              )}
            />
          </CollapsibleTrigger>
        </div>
      </div>

      <CollapsibleContent
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) return;
          if (!open) {
            setGlyphsAnimated(false);
            return;
          }
          if (String(event.animationName).includes("collapsible-down")) {
            setGlyphsAnimated(true);
          }
        }}
      >
        <IndicatorStylePicker
          value={styleId}
          busy={busy}
          glyphsAnimated={glyphsAnimated}
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
    <SettingsGroupCard
      open={sectionOpen}
      onOpenChange={setSectionOpen}
      title={t("title")}
      description={t("description")}
    >
      {INDICATOR_PLACEMENTS.map((placement) => (
        <PlacementRow
          key={placement}
          placement={placement}
          open={openPlacement === placement}
          onOpenChange={(open) => setOpenPlacement(open ? placement : null)}
        />
      ))}
    </SettingsGroupCard>
  );
}
