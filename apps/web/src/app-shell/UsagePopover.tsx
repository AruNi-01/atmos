"use client";

import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  Clock3,
  Check,
  ChevronLeft,
  ChevronRight,
  Command,
  KeyRound,
  Gauge,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@workspace/ui";

import {
  usageWsApi,
  type UsageAggregateResponse,
  type UsageOverviewResponse,
} from "@/api/ws-api";
import { useWebSocketStore } from "@/features/connection/hooks/use-websocket";
import { useLayoutSettings } from "@/features/settings/hooks/use-layout-settings";
import { useUsageProviderOrder } from "@/shared/stores/use-ui-pref-hooks";
import {
  formatNextAutoRefreshHint,
  formatTimestamp,
} from "./usage-popover-utils";
import { AggregateDetail, ProviderDetail } from "./usage-popover-detail";
import {
  AutoRefreshCountdownBadge,
  ProviderGlyph,
  ProviderSwitch,
  SortableProviderSwitch,
} from "./usage-popover-components";

export { ProviderGlyph } from "./usage-popover-components";

const STALE_MS = 3 * 60 * 1000;
const ALL_PROVIDER_ID = "all";
const ALL_PROVIDER_SWITCH_ID = "__all_providers_switch__";
const AUTO_REFRESH_OPTIONS = [
  { value: "1", label: "1min", shortLabel: "1m" },
  { value: "5", label: "5min", shortLabel: "5m" },
  { value: "15", label: "15min", shortLabel: "15m" },
  { value: "30", label: "30min", shortLabel: "30m" },
  { value: "60", label: "1H", shortLabel: "1h" },
] as const;

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-[16px] bg-muted/35" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-[20px] bg-muted/35" />
    </div>
  );
}

const EMPTY_AGGREGATE: UsageAggregateResponse = {
  enabled_count: 0,
  total_count: 0,
  active_subscription_count: 0,
  comparable_credit_currency: null,
  total_credits_used: null,
  total_credits_remaining: null,
  near_limit_sources: [],
  degraded_sources: [],
  soonest_reset_at: null,
};

interface UsagePopoverProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  embedded?: boolean;
  onPopoverCloseAutoFocus?: (e: Event) => void;
}

export function UsagePopover({ open: externalOpen, onOpenChange: externalOnOpenChange, embedded = false, onPopoverCloseAutoFocus }: UsagePopoverProps = {}) {
  const providerScrollRef = useRef<HTMLDivElement | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = embedded ? true : externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange !== undefined ? externalOnOpenChange : setInternalOpen;
  const [overview, setOverview] = useState<UsageOverviewResponse | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(ALL_PROVIDER_ID);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [switchingProviderId, setSwitchingProviderId] = useState<string | null>(null);
  const [savingManualSetupProviderId, setSavingManualSetupProviderId] = useState<string | null>(null);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);
  const [isFooterHovered, setIsFooterHovered] = useState(false);
  const [isAutoRefreshPopoverOpen, setIsAutoRefreshPopoverOpen] = useState(false);
  const [isUpdatingAutoRefresh, setIsUpdatingAutoRefresh] = useState(false);
  const [footerInfoMode, setFooterInfoMode] = useState<"updated" | "countdown">("updated");
  const [refreshSwapDirection, setRefreshSwapDirection] = useState<1 | -1>(1);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [providerScrollState, setProviderScrollState] = useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });
  const [providerOrder, setProviderOrder] = useUsageProviderOrder();
  const [switchingFooterCarouselProviderId, setSwitchingFooterCarouselProviderId] = useState<string | null>(null);
  const footerShowUsageCarousel = useLayoutSettings((s) => s.showUsageCarousel);
  const setFooterShowUsageCarousel = useLayoutSettings((s) => s.setFooterShowUsageCarousel);
  const loadLayoutSettings = useLayoutSettings((s) => s.loadSettings);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  );

  const selectedProvider = useMemo(
    () => overview?.providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [overview, selectedProviderId]
  );

  const loadOverview = useCallback(async (refresh = false, providerId?: string | null) => {
    if (!overview || refresh) setIsLoading(!overview);
    setIsRefreshing(refresh && !!overview);
    setError(null);

    try {
      const next = await usageWsApi.getOverview(refresh, providerId);
      setOverview(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load usage overview");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [overview]);

  const toggleProviderSwitch = useCallback(async (providerId: string, enabled: boolean) => {
    setSwitchingProviderId(providerId);
    setError(null);

    try {
      const next = await usageWsApi.setProviderSwitch(providerId, enabled);
      setOverview(next);
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : "Failed to update provider switch");
    } finally {
      setSwitchingProviderId(null);
    }
  }, []);

  const toggleAllProvidersSwitch = useCallback(async (enabled: boolean) => {
    setSwitchingProviderId(ALL_PROVIDER_SWITCH_ID);
    setError(null);

    try {
      const next = await usageWsApi.setAllProvidersSwitch(enabled);
      setOverview(next);
    } catch (switchError) {
      setError(
        switchError instanceof Error ? switchError.message : "Failed to update all provider switches"
      );
    } finally {
      setSwitchingProviderId(null);
    }
  }, []);

  const addProviderApiKey = useCallback(
    async (providerId: string, region: string, apiKey: string) => {
      setSavingManualSetupProviderId(providerId);
      setError(null);

      try {
        const next = await usageWsApi.addProviderApiKey(providerId, region || null, apiKey);
        setOverview(next);
      } catch (addError) {
        setError(addError instanceof Error ? addError.message : "Failed to add API key");
      } finally {
        setSavingManualSetupProviderId(null);
      }
    },
    []
  );

  const deleteProviderApiKey = useCallback(
    async (providerId: string, keyId: string) => {
      setDeletingKeyId(keyId);
      setError(null);

      try {
        const next = await usageWsApi.deleteProviderApiKey(providerId, keyId);
        setOverview(next);
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "Failed to delete API key");
      } finally {
        setDeletingKeyId(null);
      }
    },
    []
  );

  useEffect(() => {
    void loadLayoutSettings();
  }, [loadLayoutSettings]);

  useEffect(() => {
    if (!open) return;
    if (!overview) {
      void loadOverview(false);
      return;
    }

    const stale = !overview.generated_at || Date.now() - overview.generated_at * 1000 > STALE_MS;
    if (stale) {
      void loadOverview(false);
    }
  }, [open, overview, loadOverview]);

  useEffect(() => {
    return useWebSocketStore
      .getState()
      .onEvent("usage_overview_updated", (data: unknown) => {
        setOverview(data as UsageOverviewResponse);
        setError(null);
        setIsRefreshing(false);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!open || !overview?.auto_refresh.interval_minutes) return;

    setNowMs(Date.now());

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [open, overview?.auto_refresh.interval_minutes]);

  useEffect(() => {
    if (selectedProviderId === ALL_PROVIDER_ID) return;
    if (overview && !overview.providers.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(ALL_PROVIDER_ID);
    }
  }, [overview, selectedProviderId]);

  const switches = useMemo(
    () => {
      const providers = overview?.providers ?? [];
      const orderIndex = new Map(providerOrder.map((id, index) => [id, index]));
      const orderedProviders = [...providers].sort((left, right) => {
        const leftOrder = orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return left.label.localeCompare(right.label);
      });

      return [
        {
          id: ALL_PROVIDER_ID,
          label: "All",
          active: providers.some((provider) => provider.switch_enabled),
        },
        ...orderedProviders.map((provider) => ({
          id: provider.id,
          label: provider.label,
          active: provider.switch_enabled,
        })),
      ];
    },
    [overview, providerOrder]
  );

  const carouselProviders = useMemo(
    () => (overview?.providers ?? []).filter((provider) => provider.switch_enabled),
    [overview?.providers]
  );

  useEffect(() => {
    const ids = (overview?.providers ?? []).map((provider) => provider.id);
    if (ids.length === 0) return;

    setProviderOrder((current) => {
      const filtered = current.filter((id) => ids.includes(id));
      const additions = ids.filter((id) => !filtered.includes(id));
      const next = [...filtered, ...additions];
      if (next.length === current.length && next.every((id, index) => id === current[index])) {
        return current;
      }
      return next;
    });
  }, [overview?.providers, setProviderOrder]);

  const handleProviderSwitchDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setProviderOrder((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }, [setProviderOrder]);

  const updateProviderScrollState = useCallback(() => {
    const el = providerScrollRef.current;
    if (!el) return;

    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    const nextState = {
      hasOverflow: maxScrollLeft > 1,
      canScrollLeft: el.scrollLeft > 1,
      canScrollRight: el.scrollLeft < maxScrollLeft - 1,
    };

    setProviderScrollState((current) =>
      current.hasOverflow === nextState.hasOverflow &&
      current.canScrollLeft === nextState.canScrollLeft &&
      current.canScrollRight === nextState.canScrollRight
        ? current
        : nextState
    );
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const el = providerScrollRef.current;
    if (!el) return;

    updateProviderScrollState();
    const frameId = requestAnimationFrame(() => {
      updateProviderScrollState();
      requestAnimationFrame(() => {
        updateProviderScrollState();
      });
    });
    const timeoutId = window.setTimeout(() => {
      updateProviderScrollState();
    }, 160);

    const handleScroll = () => updateProviderScrollState();
    el.addEventListener("scroll", handleScroll, { passive: true });
    const handleWindowResize = () => updateProviderScrollState();
    window.addEventListener("resize", handleWindowResize);

    const resizeObserver = new ResizeObserver(() => {
      updateProviderScrollState();
    });
    resizeObserver.observe(el);
    if (el.firstElementChild instanceof HTMLElement) {
      resizeObserver.observe(el.firstElementChild);
    }

    return () => {
      cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
      el.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleWindowResize);
      resizeObserver.disconnect();
    };
  }, [open, switches, updateProviderScrollState]);

  const displayedUpdatedAt =
    selectedProviderId === ALL_PROVIDER_ID
      ? overview?.generated_at
      : selectedProvider?.last_updated_at ?? overview?.generated_at;
  const autoRefreshValue = overview?.auto_refresh.interval_minutes?.toString() ?? "";
  const autoRefreshTriggerLabel = autoRefreshValue
    ? AUTO_REFRESH_OPTIONS.find((option) => option.value === autoRefreshValue)?.shortLabel ?? "Auto"
    : "Auto";
  const autoRefreshTargetMs =
    overview?.generated_at && overview?.auto_refresh.interval_minutes
      ? overview.generated_at * 1000 + overview.auto_refresh.interval_minutes * 60_000
      : null;
  const nextAutoRefreshHint = formatNextAutoRefreshHint(
    overview?.generated_at,
    overview?.auto_refresh.interval_minutes,
    nowMs
  );
  const isAllSelected = selectedProviderId === ALL_PROVIDER_ID;
  const showFooterActions = isFooterHovered || isAutoRefreshPopoverOpen;
  const showAutoRefreshAction = isAllSelected;
  const canCycleFooterInfo = Boolean(autoRefreshTargetMs) && !error;
  const footerInfoWidthClass =
    showAutoRefreshAction || Boolean(autoRefreshTargetMs) ? "w-[236px]" : "w-[148px]";
  const showProviderArrows = providerScrollState.hasOverflow;

  useEffect(() => {
    if (!open || showFooterActions || !canCycleFooterInfo) {
      setFooterInfoMode("updated");
      return;
    }

    setFooterInfoMode("updated");

    const timer = window.setInterval(() => {
      setRefreshSwapDirection(1);
      setFooterInfoMode((current) => (current === "updated" ? "countdown" : "updated"));
    }, 5_000);

    return () => window.clearInterval(timer);
  }, [
    open,
    showFooterActions,
    canCycleFooterInfo,
    overview?.generated_at,
    overview?.auto_refresh.interval_minutes,
  ]);

  const refreshSwapVariants = {
    initial: (direction: 1 | -1) => ({
      opacity: 0,
      y: direction === 1 ? 10 : -10,
    }),
    animate: {
      opacity: 1,
      y: 0,
    },
    exit: (direction: 1 | -1) => ({
      opacity: 0,
      y: direction === 1 ? -10 : 10,
    }),
  };

  const updateAutoRefresh = useCallback(async (nextValue: string) => {
    setIsUpdatingAutoRefresh(true);
    setError(null);

    try {
      const next = await usageWsApi.setAutoRefresh(nextValue ? Number(nextValue) : null);
      setOverview(next);
      setIsAutoRefreshPopoverOpen(false);
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "Failed to update auto refresh"
      );
    } finally {
      setIsUpdatingAutoRefresh(false);
    }
  }, []);

  const toggleFooterCarouselProvider = useCallback(async (providerId: string, enabled: boolean) => {
    setSwitchingFooterCarouselProviderId(providerId);
    setError(null);

    try {
      const next = await usageWsApi.setProviderFooterCarousel(providerId, enabled);
      setOverview(next);
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : "Failed to update footer carousel"
      );
    } finally {
      setSwitchingFooterCarouselProviderId(null);
    }
  }, []);

  const PanelShell: React.ElementType = embedded ? "div" : PopoverContent;
  const panelShellProps = embedded
    ? {
      className:
        "h-full w-full overflow-hidden rounded-none border-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(244,244,245,0.985))] p-0 shadow-none dark:bg-[linear-gradient(180deg,rgba(30,30,30,0.98),rgba(15,15,15,0.99))]",
    }
    : {
      align: "end" as const,
      sideOffset: 10,
      onCloseAutoFocus: onPopoverCloseAutoFocus,
      className:
        "w-[min(92vw,560px)] rounded-[24px] border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(244,244,245,0.985))] p-0 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.30)] dark:bg-[linear-gradient(180deg,rgba(30,30,30,0.98),rgba(15,15,15,0.99))]",
    };

  const panel = (
    <PanelShell {...panelShellProps}>
        <div className={cn(
          "overflow-hidden rounded-[24px] border border-border/60",
          embedded && "flex h-full flex-col rounded-none border-0"
        )}>
          <div className={cn(
            "rounded-b-[20px] bg-background/95 pb-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-background",
            embedded && "min-h-0 flex flex-1 flex-col rounded-none"
          )}>
            <div className="px-3 pb-2.5 pt-2.5">
              <div className="relative -mx-3 px-3">
                <div
                  ref={providerScrollRef}
                  className="no-scrollbar w-full overflow-x-auto overflow-y-hidden scroll-smooth"
                >
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
                    onDragEnd={handleProviderSwitchDragEnd}
                  >
                    <div className="flex w-max items-start gap-1 px-6 pb-0.5">
                      <ProviderSwitch
                        id={switches[0].id}
                        label={switches[0].label}
                        active={switches[0].active}
                        selected={selectedProviderId === switches[0].id}
                        onClick={() => startTransition(() => setSelectedProviderId(switches[0].id))}
                      />
                      <SortableContext
                        items={switches.slice(1).map((item) => item.id)}
                        strategy={horizontalListSortingStrategy}
                      >
                        {switches.slice(1).map((item) => (
                          <SortableProviderSwitch key={item.id} id={item.id}>
                            <ProviderSwitch
                              id={item.id}
                              label={item.label}
                              active={item.active}
                              draggable={item.active && selectedProviderId === item.id}
                              selected={selectedProviderId === item.id}
                              onClick={() => startTransition(() => setSelectedProviderId(item.id))}
                            />
                          </SortableProviderSwitch>
                        ))}
                      </SortableContext>
                    </div>
                  </DndContext>
                </div>
                {showProviderArrows ? (
                  <>
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background/95 via-background/72 to-transparent dark:from-background/88 dark:via-background/58" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background/95 via-background/72 to-transparent dark:from-background/88 dark:via-background/58" />
                    <button
                      type="button"
                      aria-label="Scroll providers left"
                      onClick={() => {
                        providerScrollRef.current?.scrollBy({ left: -240, behavior: "smooth" });
                        requestAnimationFrame(updateProviderScrollState);
                      }}
                      className={cn(
                        "absolute inset-y-0 left-0 z-10 inline-flex w-8 items-center justify-center text-foreground/92 transition-opacity",
                        providerScrollState.canScrollLeft ? "opacity-100" : "cursor-default opacity-28"
                      )}
                      aria-disabled={!providerScrollState.canScrollLeft}
                    >
                      <ChevronLeft className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Scroll providers right"
                      onClick={() => {
                        providerScrollRef.current?.scrollBy({ left: 240, behavior: "smooth" });
                        requestAnimationFrame(updateProviderScrollState);
                      }}
                      className={cn(
                        "absolute inset-y-0 right-0 z-10 inline-flex w-8 items-center justify-center text-foreground/92 transition-opacity",
                        providerScrollState.canScrollRight ? "opacity-100" : "cursor-default opacity-28"
                      )}
                      aria-disabled={!providerScrollState.canScrollRight}
                    >
                      <ChevronRight className="size-3.5" />
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="mx-5 border-t border-border/40" />

            <div className={cn("px-0 pb-1 pt-2.5", embedded && "min-h-0 flex-1")}>
              {overview?.partial_failures.length ? (
                <div className="mx-4 mb-2.5 flex items-start gap-3 rounded-[16px] bg-muted/45 px-4 py-3 text-sm text-foreground">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div className="line-clamp-2">
                    {overview.partial_failures.map((issue) => `${issue.provider_label}: ${issue.message}`).join(" · ")}
                  </div>
                </div>
              ) : null}

              <div className={cn(embedded && "min-h-0 h-full")}>
                <ScrollArea className={embedded ? "h-full" : "h-[min(62vh,560px)]"} scrollbarGutter>
                <div className="px-0 py-3">
                  {isLoading && !overview ? (
                    <div className="px-4">
                      <LoadingState />
                    </div>
                  ) : error && !overview ? (
                    <div className="px-4">
                      <div className="rounded-[18px] bg-muted/45 px-4 py-4 text-sm text-foreground">
                        {error}
                      </div>
                    </div>
                  ) : selectedProviderId === ALL_PROVIDER_ID ? (
                    <div className="px-4">
                      <AggregateDetail
                        aggregate={overview?.all ?? EMPTY_AGGREGATE}
                        providers={overview?.providers ?? []}
                        providerOrder={providerOrder}
                        onToggleAllProviders={toggleAllProvidersSwitch}
                        onToggleProvider={toggleProviderSwitch}
                        isAllSwitching={switchingProviderId === ALL_PROVIDER_SWITCH_ID}
                        switchingProviderId={switchingProviderId}
                        onAddApiKey={addProviderApiKey}
                        onDeleteApiKey={deleteProviderApiKey}
                        savingManualSetupProviderId={savingManualSetupProviderId}
                        deletingKeyId={deletingKeyId}
                      />
                    </div>
                  ) : selectedProvider ? (
                    <div className="px-4">
                      <ProviderDetail
                        provider={selectedProvider}
                        onToggleProvider={toggleProviderSwitch}
                        onAddApiKey={addProviderApiKey}
                        onDeleteApiKey={deleteProviderApiKey}
                        isSavingManualSetup={savingManualSetupProviderId === selectedProvider.id}
                        deletingKeyId={deletingKeyId}
                        isSwitching={switchingProviderId === selectedProvider.id}
                      />
                    </div>
                  ) : (
                    <div className="px-4 text-sm text-foreground/90">Select a provider to inspect usage.</div>
                  )}
                </div>
                </ScrollArea>
              </div>
            </div>
          </div>

          <div className="shrink-0 px-0 pb-3 pt-3">
            <div className="flex items-center justify-between gap-3 px-4 text-xs text-foreground/90">
              <div
                className="flex items-center"
                onMouseEnter={() => {
                  setRefreshSwapDirection(1);
                  setIsFooterHovered(true);
                }}
                onMouseLeave={() => {
                  setRefreshSwapDirection(-1);
                  setIsFooterHovered(false);
                }}
              >
                <div className={cn("relative h-7", footerInfoWidthClass)}>
                  <AnimatePresence mode="wait" initial={false} custom={refreshSwapDirection}>
                    {showFooterActions ? (
                      <motion.div
                        key="footer-actions"
                        custom={refreshSwapDirection}
                        variants={refreshSwapVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="absolute left-0 top-0 inline-flex h-7 items-center gap-1"
                      >
                        {showAutoRefreshAction ? (
                          <Popover
                            open={isAutoRefreshPopoverOpen}
                            onOpenChange={setIsAutoRefreshPopoverOpen}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-7 items-center justify-center gap-1 rounded-sm border border-border/70 bg-background/85 px-2 py-1 text-[10px] font-medium hover:border-foreground/20 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label="Configure auto refresh"
                                disabled={isUpdatingAutoRefresh}
                              >
                                <Clock3 className="size-3" />
                                <span>{autoRefreshTriggerLabel}</span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              side="top"
                              align="start"
                              sideOffset={8}
                              className="w-auto min-w-max max-w-none rounded-[18px] border-border/70 p-3"
                            >
                              <div className="space-y-3">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="space-y-1">
                                    <div className="text-xs font-medium text-foreground">
                                      Auto Refresh ALL
                                    </div>
                                  </div>
                                  {nextAutoRefreshHint ? (
                                    <div className="flex min-h-4 items-center whitespace-nowrap text-[11px] text-foreground/90">
                                      <span>{nextAutoRefreshHint.suffix}&nbsp;</span>
                                      <span className="font-medium text-foreground">
                                        {nextAutoRefreshHint.value}
                                      </span>
                                    </div>
                                  ) : null}
                                </div>
                                <ToggleGroup
                                  type="single"
                                  size="sm"
                                  variant="outline"
                                  spacing={2}
                                  value={autoRefreshValue}
                                  onValueChange={(value) => {
                                    if (value === autoRefreshValue) {
                                      void updateAutoRefresh("");
                                      return;
                                    }
                                    void updateAutoRefresh(value);
                                  }}
                                  className="inline-flex flex-nowrap items-center whitespace-nowrap"
                                >
                                  {AUTO_REFRESH_OPTIONS.map((option) => (
                                    <ToggleGroupItem
                                      key={option.value}
                                      value={option.value}
                                      aria-label={`Set auto refresh to ${option.label}`}
                                      title={option.label}
                                      className="rounded-md text-[11px]"
                                      disabled={isUpdatingAutoRefresh}
                                    >
                                      {option.shortLabel}
                                    </ToggleGroupItem>
                                  ))}
                                </ToggleGroup>
                                <div className="text-[11px] text-foreground/90">
                                  Click the active interval again to turn it off.
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : null}

                        <button
                          type="button"
                          onClick={() =>
                            void loadOverview(
                              true,
                              selectedProviderId === ALL_PROVIDER_ID ? null : selectedProviderId
                            )
                          }
                          className="inline-flex h-7 items-center justify-center gap-1 rounded-sm border border-border/70 bg-background/85 px-2 py-1 hover:border-foreground/20 hover:text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={isRefreshing}
                          aria-label="Refresh usage"
                        >
                          {isRefreshing
                            ? <LoaderCircle className="block size-3 shrink-0 [transform-box:fill-box] [transform-origin:center] animate-spin" />
                            : <RotateCcw className="block size-3 shrink-0 [transform-box:fill-box] [transform-origin:center]" />}
                          <span className="text-[10px] font-medium">Refresh</span>
                        </button>
                      </motion.div>
                    ) : canCycleFooterInfo &&
                      footerInfoMode === "countdown" &&
                      autoRefreshTargetMs ? (
                      <motion.div
                        key="footer-countdown"
                        custom={refreshSwapDirection}
                        variants={refreshSwapVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute inset-0 inline-flex h-7 w-full items-center gap-1 whitespace-nowrap"
                      >
                        <span className="text-[11px] text-foreground/90">Next update</span>
                        <AutoRefreshCountdownBadge targetTimeMs={autoRefreshTargetMs} />
                      </motion.div>
                    ) : (
                      <motion.span
                        key={error && overview ? "footer-error" : "updated-time"}
                        custom={refreshSwapDirection}
                        variants={refreshSwapVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute inset-0 inline-flex h-7 w-full items-center whitespace-nowrap"
                      >
                        {error && overview ? error : `Updated ${formatTimestamp(displayedUpdatedAt)}`}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <TooltipProvider delayDuration={180}>
                <div className="inline-flex items-center gap-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Why Keychain Access may be needed"
                      >
                        <KeyRound className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center" className="max-w-65">
                      Atmos may use Keychain Access to decrypt browser cookies for providers that only expose usage through signed-in web sessions. Keys stay local and are used only to read usage data.
                    </TooltipContent>
                  </Tooltip>

                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-muted-foreground/80 transition-colors hover:text-foreground"
                        aria-label="Configure footer AI Usage carousel"
                      >
                        <Gauge className="size-3.5" />
                        {carouselProviders.filter((provider) => provider.footer_carousel_show).length > 0 ? (
                          <span className="min-w-3 text-[10px] font-medium leading-none">
                            {carouselProviders.filter((provider) => provider.footer_carousel_show).length}
                          </span>
                        ) : null}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      align="end"
                      sideOffset={8}
                      className="w-56 rounded-[16px] border-border/70 p-2"
                    >
                      <div className="flex items-start justify-between gap-3 px-2 pb-2 pt-1">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-foreground">Footer carousel</div>
                          <div className="mt-0.5 text-[11px] text-foreground/75">
                            Choose enabled AI Usage sources shown in the app footer.
                          </div>
                        </div>
                        <Switch
                          checked={footerShowUsageCarousel}
                          onCheckedChange={(checked) => void setFooterShowUsageCarousel(!!checked)}
                          aria-label="Show AI usage carousel in app footer"
                        />
                      </div>
                        {carouselProviders.length > 0 ? (
                          <div className="max-h-64 overflow-y-auto">
                            {carouselProviders.map((provider) => {
                              const checked = provider.footer_carousel_show;
                              const isSwitchingFooterCarousel = switchingFooterCarouselProviderId === provider.id;
                              return (
                                <button
                                  key={provider.id}
                                  type="button"
                                  aria-pressed={checked}
                                  disabled={isSwitchingFooterCarousel || !footerShowUsageCarousel}
                                  onClick={() => void toggleFooterCarouselProvider(provider.id, !checked)}
                                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted/65 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border/60 bg-background/75 text-foreground/85 [&_svg]:size-3.5 [&_span]:size-3.5">
                                    <ProviderGlyph providerId={provider.id} size={14} />
                                  </span>
                                  <span className="min-w-0 truncate">{provider.label}</span>
                                </span>
                                <span
                                  className={cn(
                                    "flex size-4 shrink-0 items-center justify-center rounded-sm border border-border/80",
                                    checked && "border-foreground bg-foreground text-background"
                                  )}
                                >
                                  {checked ? <Check className="size-3" /> : null}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        ) : (
                          <div className="px-2 py-3 text-[11px] text-foreground/75">
                            No enabled AI Usage sources yet.
                          </div>
                        )}
                    </PopoverContent>
                  </Popover>
                </div>
              </TooltipProvider>
            </div>
          </div>
        </div>
    </PanelShell>
  );

  return (
    <TooltipProvider>
      {embedded ? (
        panel
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  aria-label="Usage"
                  className="size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
                >
                  <Gauge className="size-3.5" />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex items-center gap-2">
                <span>AI Quota Usage</span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-foreground/90">
                  <Command className="size-3" /><span className="text-xs">U</span>
                </kbd>
              </div>
            </TooltipContent>
          </Tooltip>
          {panel}
        </Popover>
      )}
    </TooltipProvider>
  );
}
