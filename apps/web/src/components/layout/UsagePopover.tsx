"use client";

import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  Clock3,
  BookMarked,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Command,
  KeyRound,
  Blocks,
  Coins,
  Gauge,
  RefreshCcw,
} from "lucide-react";
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScrollArea,
  Switch,
  TimerDisplay,
  TimerRoot,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  UiTimerIcon,
  cn,
  useTimer,
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  CSS,
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@workspace/ui";

import {
  usageWsApi,
  type UsageAggregateResponse,
  type UsageManualSetupResponse,
  type UsageOverviewResponse,
  type UsageProviderResponse,
} from "@/api/ws-api";
import { useWebSocketStore } from "@/hooks/use-websocket";

const STALE_MS = 3 * 60 * 1000;
const ALL_PROVIDER_ID = "all";
const ALL_PROVIDER_SWITCH_ID = "__all_providers_switch__";
const PROVIDER_ORDER_STORAGE_KEY = "usage-popover-provider-order";
const AUTO_REFRESH_OPTIONS = [
  { value: "1", label: "1min", shortLabel: "1m" },
  { value: "5", label: "5min", shortLabel: "5m" },
  { value: "15", label: "15min", shortLabel: "15m" },
  { value: "30", label: "30min", shortLabel: "30m" },
  { value: "60", label: "1H", shortLabel: "1h" },
] as const;

function formatTimestamp(value?: number | null): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

function formatRelativeReset(value?: number | null): string {
  if (!value) return "Reset unknown";
  const diffMs = value * 1000 - Date.now();
  if (diffMs <= 0) return "Resetting now";

  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    const remHours = hours % 24;
    return `Resets in ${days}d ${remHours}h`;
  }
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  return `Resets in ${hours}h ${mins}m`;
}

function formatNextAutoRefreshHint(
  generatedAt?: number | null,
  intervalMinutes?: number | null,
  nowMs: number = Date.now()
): { value: string; suffix: string } | null {
  if (!generatedAt || !intervalMinutes) return null;

  const nextUpdateAtMs = generatedAt * 1000 + intervalMinutes * 60_000;
  const diffMs = nextUpdateAtMs - nowMs;
  if (diffMs <= 0) {
    return { value: "<1min", suffix: "Next update in" };
  }

  const remainingMinutes = Math.round(diffMs / 60_000);
  if (remainingMinutes <= 0) {
    return { value: "<1min", suffix: "Next update in" };
  }
  return { value: `${remainingMinutes}min`, suffix: "Next update in" };
}

function formatCountdownDisplay(remainingMs: number): string {
  const safeRemainingMs = Math.max(0, remainingMs);
  const totalMinutes = Math.floor(safeRemainingMs / 60_000);
  const seconds = Math.floor((safeRemainingMs % 60_000) / 1_000);
  const centiseconds = Math.floor((safeRemainingMs % 1_000) / 10);

  return `${totalMinutes.toString().padStart(2, "0")}.${seconds.toString().padStart(2, "0")}.${centiseconds
    .toString()
    .padStart(2, "0")}`;
}

function extractPercent(text?: string | null): number | null {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)%\s*used/i);
  if (!match) return null;
  return Number(match[1]);
}

function extractResetText(text?: string | null): string | null {
  if (!text) return null;
  const parts = text.split("·").map((part) => part.trim()).filter(Boolean);
  const resetPart = parts.findLast((part) => /^reset/i.test(part));
  return resetPart ?? null;
}

function extractMetricDetail(text?: string | null): string | null {
  if (!text) return null;
  const parts = text.split("·").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const detailParts = parts.slice(1).filter((part) => !/^reset/i.test(part));
  return detailParts[0] ?? null;
}

function displayResetText(
  explicitResetText?: string | null,
  fallbackResetAt?: number | null
): string | null {
  if (explicitResetText) return explicitResetText;
  if (!fallbackResetAt) return null;
  const fallbackText = formatRelativeReset(fallbackResetAt);
  return fallbackText === "Reset unknown" ? null : fallbackText;
}

function displayMetricUsedText(metric: UsageMetricRow): string {
  if (metric.percent === null || metric.percent === undefined) {
    return metric.value;
  }
  const amountSuffix = metric.amountText ? ` (${metric.amountText})` : "";
  if (metric.detailText) {
    return `${metric.percent.toFixed(0)}% used${amountSuffix} (${metric.detailText})`;
  }
  return `${metric.percent.toFixed(0)}% used${amountSuffix}`;
}

type UsageMetricRow = {
  label: string;
  value: string;
  percent: number | null;
  amountText: string | null;
  detailText: string | null;
  resetText: string | null;
};

function formatUsageAmountText(provider: UsageProviderResponse): string | null {
  const summary = provider.usage_summary;
  if (!summary) return null;
  const isDollarUsage =
    summary.unit?.toLowerCase() === "usd" ||
    summary.currency === "$" ||
    summary.currency === "USD";
  if (!isDollarUsage) return null;
  if (summary.used == null || summary.cap == null) return null;

  return `$${summary.used.toFixed(0)} / $${summary.cap.toFixed(0)}`;
}

type ProviderRegion = "global" | "china";

function firstRowValue(
  provider: UsageProviderResponse,
  sectionTitle: string,
  rowLabel: string
): string | null {
  const section = provider.detail_sections.find(
    (item) => item.title.toLowerCase() === sectionTitle.toLowerCase()
  );
  const row = section?.rows.find((item) => item.label.toLowerCase() === rowLabel.toLowerCase());
  return row?.value ?? null;
}

function sectionRows(provider: UsageProviderResponse, sectionTitle: string) {
  return provider.detail_sections.find(
    (item) => item.title.toLowerCase() === sectionTitle.toLowerCase()
  )?.rows ?? [];
}

function extraSections(provider: UsageProviderResponse) {
  return provider.detail_sections.filter((section) => {
    const title = section.title.toLowerCase();
    return (
      title !== "account" &&
      title !== "usage" &&
      title !== "credits" &&
      title !== "fetch pipeline"
    );
  });
}

function sectionHeaderValue(
  provider: UsageProviderResponse,
  section: UsageProviderResponse["detail_sections"][number]
): string | null {
  if (provider.id !== "zai") return null;
  if (section.title.toLowerCase() !== "mcp details") return null;
  return section.rows.find((row) => row.label.toLowerCase() === "total")?.value ?? null;
}

function visibleSectionRows(
  provider: UsageProviderResponse,
  section: UsageProviderResponse["detail_sections"][number]
) {
  if (provider.id !== "zai") return section.rows;
  if (section.title.toLowerCase() !== "mcp details") return section.rows;
  return section.rows.filter((row) => row.label.toLowerCase() !== "total");
}

function inferProviderRegion(provider: UsageProviderResponse): ProviderRegion | null {
  const selectedRegion = provider.manual_setup?.selected_region?.toLowerCase();
  if (selectedRegion === "global" || selectedRegion === "china") {
    return selectedRegion;
  }

  if (provider.id === "minimax") {
    const labels = usageMetrics(provider).map((metric) => metric.label.toLowerCase());
    const hasGlobal = labels.includes("global");
    const hasChina = labels.includes("china");
    if (hasGlobal && !hasChina) return "global";
    if (hasChina && !hasGlobal) return "china";
    return null;
  }

  if (provider.id === "zai") {
    const labels = [
      ...usageMetrics(provider).map((metric) => metric.label.toLowerCase()),
      ...extraSections(provider).map((section) => section.title.toLowerCase()),
    ];
    const hasGlobal = labels.some((label) => label.startsWith("global "));
    const hasChina = labels.some(
      (label) => label === "tokens" || label === "mcp" || label === "mcp details"
    );
    if (hasGlobal && !hasChina) return "global";
    if (hasChina && !hasGlobal) return "china";
  }

  return null;
}

function usagePortalUrl(providerId: string, region: ProviderRegion | null): string | null {
  if (providerId === "zai") {
    if (region === "china") return "https://bigmodel.cn/usercenter/glm-coding/usage";
    if (region === "global") return "https://z.ai/manage-apikey/subscription";
  }

  if (providerId === "minimax") {
    if (region === "china") {
      return "https://platform.minimaxi.com/user-center/payment/coding-plan";
    }
    if (region === "global") {
      return "https://platform.minimax.io/user-center/payment/coding-plan";
    }
  }

  return null;
}

function UsagePortalLink({
  providerId,
  region,
  className,
}: {
  providerId: string;
  region: ProviderRegion | null;
  className?: string;
}) {
  const href = usagePortalUrl(providerId, region);
  if (!href) return null;
  const regionLabel = region ? (region === "china" ? "China" : "Global") : null;

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 truncate text-[11px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        <span className="truncate">{href}</span>
      </a>
      {regionLabel ? (
        <span className="inline-flex shrink-0 items-center rounded-sm border border-border/70 bg-background/75 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/85">
          {regionLabel}
        </span>
      ) : null}
    </div>
  );
}

function usageMetrics(provider: UsageProviderResponse): UsageMetricRow[] {
  const amountText = formatUsageAmountText(provider);
  return sectionRows(provider, "Usage")
    .filter((row) => Boolean(row.value?.trim()))
    .filter((row) => row.label.toLowerCase() !== "billing period")
    .map((row, index) => ({
      label: row.label,
      value: row.value,
      percent:
        extractPercent(row.value) ??
        (index === 0 ? (provider.usage_summary?.percent ?? null) : null),
      amountText: index === 0 ? amountText : null,
      detailText: extractMetricDetail(row.value),
      resetText: extractResetText(row.value),
    }));
}

function providerIdentity(provider: UsageProviderResponse) {
  const rawAccount =
    firstRowValue(provider, "Account", "Account") ?? provider.auth_state.source ?? "Not detected";
  const rawPlan =
    firstRowValue(provider, "Account", "Plan") ??
    provider.subscription_summary?.plan_label ??
    provider.fetch_state.message ??
    "No plan data";
  const genericAccount = rawAccount.trim().toLowerCase() === provider.label.trim().toLowerCase();
  const accountLabel = genericAccount && rawPlan ? rawPlan : rawAccount;
  const periodLabel =
    firstRowValue(provider, "Usage", "Billing period") ??
    firstRowValue(provider, "Account", "Period") ??
    null;
  const planLabel = rawPlan && rawPlan !== accountLabel ? rawPlan : null;
  return { accountLabel, planLabel, periodLabel };
}

function ProviderGlyph({ providerId }: { providerId: string }) {
  const iconClass = "size-[26px] stroke-[1.8]";

  if (providerId === ALL_PROVIDER_ID) {
    return <Blocks className={iconClass} />;
  }

  const iconIds = new Set([
    "claude",
    "codex",
    "cursor",
    "opencode",
    "factory",
    "gemini",
    "antigravity",
    "zai",
    "minimax",
    "kimi",
    "amp",
    "zed",
  ]);

  if (!iconIds.has(providerId)) {
    return <Coins className={iconClass} />;
  }

  return (
    <span
      aria-hidden="true"
      className="size-6.5 shrink-0 select-none bg-current"
      style={{
        WebkitMaskImage: `url(/ai-provider/${providerId}.svg)`,
        maskImage: `url(/ai-provider/${providerId}.svg)`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}

function UsageSwitch({
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "h-[18px] w-8 border border-border/70 bg-background/80 shadow-none transition-colors",
        "data-[state=checked]:border-foreground/85 data-[state=checked]:bg-foreground",
        "data-[state=unchecked]:bg-background/70",
        "[&_[data-slot=switch-thumb]]:size-[13px] [&_[data-slot=switch-thumb]]:shadow-none",
        "data-[state=checked]:[&_[data-slot=switch-thumb]]:bg-background",
        "data-[state=unchecked]:[&_[data-slot=switch-thumb]]:bg-muted-foreground/65"
      )}
    />
  );
}

function ProviderSwitch({
  id,
  label,
  selected,
  active,
  draggable,
  onClick,
}: {
  id: string;
  label: string;
  selected: boolean;
  active: boolean;
  draggable?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "group relative flex w-[64px] shrink-0 flex-col items-center gap-1.5 rounded-[16px] border border-transparent px-1.5 py-2.5 transition-all duration-200",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        selected
          ? "border-border/75 bg-accent/75 text-foreground shadow-[0_14px_30px_-22px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.06)]"
          : active
            ? "text-foreground/85 hover:bg-muted/55"
            : "text-muted-foreground/55 hover:bg-muted/45 hover:text-foreground/90"
      )}
    >
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-[14px] border transition-all duration-200",
          selected
            ? "border-border/80 bg-background/92 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            : active
              ? "border-border/70 bg-background/80 text-foreground/90"
              : "border-border/45 bg-background/55 text-muted-foreground/55"
        )}
      >
        <ProviderGlyph providerId={id} />
      </div>
      <div
        className={cn(
          "max-w-full truncate text-[10px] font-semibold leading-none",
          selected ? "text-foreground" : active ? "text-foreground/85" : "text-muted-foreground/55"
        )}
      >
        {label}
      </div>
    </button>
  );
}

function SortableProviderSwitch({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn("shrink-0", isDragging && "z-20 opacity-90")}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function UsageBar({ percent }: { percent?: number | null }) {
  const safePercent = Math.max(0, Math.min(percent ?? 0, 100));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-muted/80">
      <div
        className="h-full rounded-full bg-foreground transition-all duration-300"
        style={{ width: `${safePercent}%` }}
      />
    </div>
  );
}

function AutoRefreshCountdownBadge({ targetTimeMs }: { targetTimeMs: number }) {
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());

  const { milliseconds } = useTimer({
    loading: true,
    format: "MM.SS.MS",
    onTick: () => {
      setCurrentTimeMs(Date.now());
    },
  });
  const time = formatCountdownDisplay(targetTimeMs - currentTimeMs);

  return (
    <TimerRoot
      variant="ghost"
      size="sm"
      loading
      data-tick={milliseconds}
      className="h-7 gap-1.5 rounded-sm px-1 text-[10px] font-medium text-foreground shadow-none"
    >
      <UiTimerIcon size="sm" loading className="text-foreground/90" />
      <TimerDisplay
        size="sm"
        time={time}
        label="Time until next auto refresh"
        className="text-[10px] text-foreground"
      />
    </TimerRoot>
  );
}

function ProviderManualSetupForm({
  providerId,
  manualSetup,
  onSave,
  isSaving,
}: {
  providerId: string;
  manualSetup: UsageManualSetupResponse;
  onSave: (providerId: string, region: string, apiKey: string) => void;
  isSaving: boolean;
}) {
  const [region, setRegion] = useState(manualSetup.selected_region ?? "auto");
  const [apiKey, setApiKey] = useState("");
  const selectedRegion =
    region === "global" || region === "china" ? (region as ProviderRegion) : null;

  return (
    <div className="mt-3 rounded-[12px] border border-border/60 bg-muted/20 p-3">
      <div className="grid gap-2.5">
        <div className="grid gap-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/90">
            Region
          </div>
          <Select value={region} onValueChange={setRegion} disabled={isSaving}>
            <SelectTrigger className="h-8 w-full rounded-[10px] bg-background/70 text-xs">
              <SelectValue placeholder="Select region" />
            </SelectTrigger>
            <SelectContent>
              {manualSetup.region_options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <UsagePortalLink providerId={providerId} region={selectedRegion} className="mt-1" />
        </div>

        <div className="grid gap-1">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/90">
              API Key
            </div>
            {manualSetup.api_key_configured ? (
              <div className="text-[10px] text-foreground/90">Stored locally</div>
            ) : null}
          </div>
          <Input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={manualSetup.api_key_configured ? "Replace stored key" : "Paste API key"}
            disabled={isSaving}
            className="h-8 rounded-[10px] bg-background/70 text-xs"
          />
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onSave(providerId, region, apiKey)}
            disabled={isSaving || (!apiKey.trim() && region === (manualSetup.selected_region ?? "auto"))}
            className="h-8 rounded-[10px] px-3 text-xs"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function AggregateDetail({
  aggregate,
  providers,
  providerOrder,
  onToggleAllProviders,
  onToggleProvider,
  onSaveManualSetup,
  isAllSwitching,
  savingManualSetupProviderId,
  switchingProviderId,
}: {
  aggregate: UsageAggregateResponse;
  providers: UsageProviderResponse[];
  providerOrder: string[];
  onToggleAllProviders: (enabled: boolean) => void;
  onToggleProvider: (providerId: string, enabled: boolean) => void;
  onSaveManualSetup: (providerId: string, region: string, apiKey: string) => void;
  isAllSwitching: boolean;
  savingManualSetupProviderId: string | null;
  switchingProviderId: string | null;
}) {
  const providerOrderIndex = useMemo(
    () => new Map(providerOrder.map((id, index) => [id, index])),
    [providerOrder]
  );

  const sortedProviders = [...providers].sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
    if (left.switch_enabled !== right.switch_enabled) return left.switch_enabled ? -1 : 1;
    const leftOrder = providerOrderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = providerOrderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.label.localeCompare(right.label);
  });
  const allSwitchEnabled = providers.length > 0 && providers.every((provider) => provider.switch_enabled);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="text-[18px] font-semibold tracking-tight text-foreground">All Providers</div>
          <UsageSwitch
            checked={allSwitchEnabled}
            onCheckedChange={onToggleAllProviders}
            disabled={isAllSwitching}
            ariaLabel="All provider usage switch"
          />
        </div>
        <div className="text-sm font-medium text-foreground/90">
          Active {aggregate.enabled_count}/{aggregate.total_count}
        </div>
      </div>

      {sortedProviders.length > 0 ? (
        <AnimatePresence initial={false} mode="popLayout">
          {sortedProviders.map((provider) => (
            <AggregateProviderRow
              key={provider.id}
              provider={provider}
              onToggleProvider={onToggleProvider}
              onSaveManualSetup={onSaveManualSetup}
              isSavingManualSetup={savingManualSetupProviderId === provider.id}
              isSwitching={switchingProviderId === provider.id}
            />
          ))}
        </AnimatePresence>
      ) : (
        <div className="rounded-[16px] border border-border/60 bg-background/60 px-4 py-3 text-sm text-foreground/90">
          No active providers
        </div>
      )}
    </div>
  );
}

function AggregateProviderRow({
  provider,
  onToggleProvider,
  onSaveManualSetup,
  isSavingManualSetup,
  isSwitching,
}: {
  provider: UsageProviderResponse;
  onToggleProvider: (providerId: string, enabled: boolean) => void;
  onSaveManualSetup: (providerId: string, region: string, apiKey: string) => void;
  isSavingManualSetup: boolean;
  isSwitching: boolean;
}) {
  const [open, setOpen] = useState(false);
  const metrics = usageMetrics(provider);
  const extraDetailSections = extraSections(provider);
  const providerRegion = inferProviderRegion(provider);
  const primaryMetric = metrics[0] ?? null;
  const creditsBalance = firstRowValue(provider, "Credits", "Balance");
  const creditsState = firstRowValue(provider, "Credits", "State");
  const { accountLabel, planLabel, periodLabel } = providerIdentity(provider);
  const detectHint =
    provider.auth_state.detail ??
    provider.warnings[0] ??
    provider.fetch_state.message ??
    "Add local auth or token for this provider so Atmos can detect usage.";
  const isDetected = provider.enabled;

  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
      className="overflow-hidden rounded-[14px] border border-border/85 bg-muted/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((value) => !value);
          }
        }}
        className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-muted/32"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-[11px] border border-border/75 bg-background/96 text-foreground/90">
            <ProviderGlyph providerId={provider.id} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate text-left text-sm font-semibold text-foreground">
                {provider.label}
              </div>
              <div
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <UsageSwitch
                  checked={provider.switch_enabled}
                  onCheckedChange={(checked) => onToggleProvider(provider.id, checked)}
                  disabled={isSwitching}
                  ariaLabel={`${provider.label} refresh switch`}
                />
              </div>
            </div>
            {planLabel ? (
              <div className="truncate text-[11px] text-foreground/90">{planLabel}</div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3 text-left">
          <div className="text-right">
            <div className="text-xs text-foreground">
              {isDetected
                ? primaryMetric?.percent !== null && primaryMetric?.percent !== undefined
                  ? `${primaryMetric.percent.toFixed(0)}%`
                  : (creditsBalance ?? creditsState ?? "Active")
                : "Not detected"}
            </div>
            <div className="text-[11px] text-foreground/90">
              {isDetected
                ? primaryMetric?.percent !== null && primaryMetric?.percent !== undefined
                  ? primaryMetric.label
                  : "Status"
                : "Setup"}
            </div>
          </div>
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
        <div className="border-t border-border/60 px-3.5 py-3.5">
          {isDetected ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate text-sm text-foreground">{accountLabel}</div>
                  {periodLabel ? (
                    <div className="mt-0.5 truncate text-[11px] text-foreground/90">
                      {periodLabel}
                    </div>
                  ) : null}
                  <UsagePortalLink
                    providerId={provider.id}
                    region={providerRegion}
                    className="mt-1"
                  />
                </div>
                <div className="text-right text-[11px] text-foreground/90">
                  {provider.fetch_state.status}
                </div>
              </div>

              <div className="mt-3.5 space-y-3.5">
                {metrics.length > 0 ? (
                  metrics.map((metric) => (
                    <div key={metric.label}>
                      <div className="text-sm font-medium text-foreground">{metric.label}</div>
                      {metric.percent !== null && metric.percent !== undefined ? (
                        <div className="mt-1.5">
                          <UsageBar percent={metric.percent} />
                        </div>
                      ) : null}
                      <div className="mt-1 flex items-center justify-between gap-4 text-[11px]">
                        <div className="text-foreground">{displayMetricUsedText(metric)}</div>
                        <div className="text-foreground/90">
                          {metric.percent !== null && metric.percent !== undefined
                            ? displayResetText(
                                metric.resetText,
                                provider.subscription_summary?.reset_at
                              )
                            : null}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div>
                    <div className="text-sm font-medium text-foreground">Usage</div>
                    <div className="mt-1 text-[11px] text-foreground/90">No usage data</div>
                  </div>
                )}

                {creditsBalance || creditsState ? (
                  <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-2.5 text-sm">
                    <div className="text-foreground">Credits</div>
                    <div className="text-right">
                      <div className="text-foreground">{creditsBalance ?? "Unknown"}</div>
                      <div className="text-[11px] text-foreground/90">{creditsState ?? "Credits"}</div>
                    </div>
                  </div>
                ) : null}

                {extraDetailSections.map((section) => (
                  <div key={section.title} className="border-t border-border/60 pt-2.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="text-sm font-medium text-foreground">{section.title}</div>
                      {sectionHeaderValue(provider, section) ? (
                        <div className="text-right text-[11px] text-foreground/90">
                          {sectionHeaderValue(provider, section)}
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {visibleSectionRows(provider, section).map((row) => (
                        <div key={`${section.title}:${row.label}`} className="flex items-start justify-between gap-4 text-[11px]">
                          <div className="text-foreground/90">{row.label}</div>
                          <div className="text-right text-foreground">{row.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Detection required</div>
              <div className="text-[11px] leading-5 text-foreground/90">{detectHint}</div>
              <div className="rounded-[12px] bg-muted/35 px-3 py-2 text-[11px] leading-5 text-foreground/90">
                {provider.auth_state.setup_hint ??
                  "Sign in to the local app or add a supported local token/config so Atmos can detect this provider."}
              </div>
              {provider.manual_setup ? (
                <ProviderManualSetupForm
                  key={`${provider.id}:${provider.manual_setup.selected_region ?? "auto"}:${provider.manual_setup.api_key_configured ? "configured" : "empty"}`}
                  providerId={provider.id}
                  manualSetup={provider.manual_setup}
                  onSave={onSaveManualSetup}
                  isSaving={isSavingManualSetup}
                />
              ) : null}
            </div>
          )}
        </div>
        </motion.div>
      ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function ProviderDetail({
  provider,
  onToggleProvider,
  onSaveManualSetup,
  isSavingManualSetup,
  isSwitching,
}: {
  provider: UsageProviderResponse;
  onToggleProvider: (providerId: string, enabled: boolean) => void;
  onSaveManualSetup: (providerId: string, region: string, apiKey: string) => void;
  isSavingManualSetup: boolean;
  isSwitching: boolean;
}) {
  const { accountLabel, planLabel, periodLabel } = providerIdentity(provider);
  const metrics = usageMetrics(provider);
  const extraDetailSections = extraSections(provider);
  const providerRegion = inferProviderRegion(provider);
  const creditsBalance = firstRowValue(provider, "Credits", "Balance");
  const creditsState = firstRowValue(provider, "Credits", "State");
  const warningText = provider.warnings[0] ?? (provider.fetch_state.status !== "ready" ? provider.fetch_state.message : null);
  const showCredits = Boolean(creditsBalance || creditsState);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-[18px] font-semibold tracking-tight text-foreground">{provider.label}</div>
              <UsageSwitch
                checked={provider.switch_enabled}
                onCheckedChange={(checked) => onToggleProvider(provider.id, checked)}
                disabled={isSwitching}
                ariaLabel={`${provider.label} refresh switch`}
              />
            </div>
            {provider.id === "zed" && periodLabel ? (
              <div className="mt-1 text-sm text-foreground/90">{periodLabel}</div>
            ) : null}
            <UsagePortalLink
              providerId={provider.id}
              region={providerRegion}
              className="mt-1"
            />
          </div>
          <div className="text-right">
            <div className="text-sm text-foreground">{accountLabel}</div>
            {planLabel ? (
              <div className="mt-1 text-sm text-foreground/90">{planLabel}</div>
            ) : null}
          </div>
        </div>
      </div>

      {metrics.map((metric) => (
        <section key={metric.label} className="border-t border-border/70 pt-5">
          <div className="text-[18px] font-semibold tracking-tight text-foreground">{metric.label}</div>
          {metric.percent !== null && metric.percent !== undefined ? (
            <div className="mt-4">
              <UsageBar percent={metric.percent} />
            </div>
          ) : null}
          <div className="mt-2 flex items-center justify-between gap-4 text-sm">
            <div className="text-foreground">{displayMetricUsedText(metric)}</div>
            <div className="text-foreground/90">
              {metric.percent !== null && metric.percent !== undefined
                ? displayResetText(metric.resetText, provider.subscription_summary?.reset_at)
                : null}
            </div>
          </div>
        </section>
      ))}

      {showCredits ? (
        <section className="border-t border-border/70 pt-5">
          <div className="text-[18px] font-semibold tracking-tight text-foreground">Credits</div>
          <div className="mt-4 h-2 rounded-full bg-muted/60" />
          <div className="mt-2 flex items-center justify-between gap-4 text-sm">
            <div className="text-foreground">{creditsBalance ?? creditsState ?? "Unknown"}</div>
            <div className="text-foreground/90">{creditsState && creditsBalance ? creditsState : null}</div>
          </div>
          {warningText ? (
            <div className="mt-3 text-sm leading-6 text-foreground/90">{warningText}</div>
          ) : null}
        </section>
      ) : warningText ? (
        <section className="border-t border-border/70 pt-5">
          <div className="text-sm leading-6 text-foreground/90">{warningText}</div>
          {provider.manual_setup && provider.fetch_state.status !== "ready" ? (
            <ProviderManualSetupForm
              key={`${provider.id}:${provider.manual_setup.selected_region ?? "auto"}:${provider.manual_setup.api_key_configured ? "configured" : "empty"}`}
              providerId={provider.id}
              manualSetup={provider.manual_setup}
              onSave={onSaveManualSetup}
              isSaving={isSavingManualSetup}
            />
          ) : null}
        </section>
      ) : null}

      {extraDetailSections.map((section) => (
        <section key={section.title} className="border-t border-border/70 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="text-[18px] font-semibold tracking-tight text-foreground">{section.title}</div>
            {sectionHeaderValue(provider, section) ? (
              <div className="pt-1 text-right text-sm text-foreground/90">
                {sectionHeaderValue(provider, section)}
              </div>
            ) : null}
          </div>
          <div className="mt-3 space-y-2">
            {visibleSectionRows(provider, section).map((row) => (
              <div key={`${section.title}:${row.label}`} className="flex items-start justify-between gap-4 text-sm">
                <div className="text-foreground/90">{row.label}</div>
                <div className="text-right text-foreground">{row.value}</div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {!showCredits && !warningText && provider.manual_setup && provider.fetch_state.status !== "ready" ? (
        <section className="border-t border-border/70 pt-5">
          <ProviderManualSetupForm
            key={`${provider.id}:${provider.manual_setup.selected_region ?? "auto"}:${provider.manual_setup.api_key_configured ? "configured" : "empty"}`}
            providerId={provider.id}
            manualSetup={provider.manual_setup}
            onSave={onSaveManualSetup}
            isSaving={isSavingManualSetup}
          />
        </section>
      ) : null}
    </div>
  );
}

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
}

export function UsagePopover({ open: externalOpen, onOpenChange: externalOnOpenChange }: UsagePopoverProps = {}) {
  const providerScrollRef = useRef<HTMLDivElement | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange !== undefined ? externalOnOpenChange : setInternalOpen;
  const [overview, setOverview] = useState<UsageOverviewResponse | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(ALL_PROVIDER_ID);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [switchingProviderId, setSwitchingProviderId] = useState<string | null>(null);
  const [savingManualSetupProviderId, setSavingManualSetupProviderId] = useState<string | null>(null);
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
  const [providerOrder, setProviderOrder] = useState<string[]>([]);

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

  const saveProviderManualSetup = useCallback(
    async (providerId: string, region: string, apiKey: string) => {
      setSavingManualSetupProviderId(providerId);
      setError(null);

      try {
        const next = await usageWsApi.setProviderManualSetup(
          providerId,
          region,
          apiKey.trim() ? apiKey.trim() : null
        );
        setOverview(next);
      } catch (setupError) {
        setError(
          setupError instanceof Error ? setupError.message : "Failed to save provider setup"
        );
      } finally {
        setSavingManualSetupProviderId(null);
      }
    },
    []
  );

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(PROVIDER_ORDER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
        setProviderOrder(parsed);
      }
    } catch {
      // ignore invalid persisted data
    }
  }, []);

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
  }, [overview?.providers]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (providerOrder.length === 0) return;
    window.localStorage.setItem(PROVIDER_ORDER_STORAGE_KEY, JSON.stringify(providerOrder));
  }, [providerOrder]);

  const handleProviderSwitchDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setProviderOrder((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }, []);

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

  return (
    <TooltipProvider>
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
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(92vw,560px)] rounded-[24px] border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(244,244,245,0.985))] p-0 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.30)] dark:bg-[linear-gradient(180deg,rgba(30,30,30,0.98),rgba(15,15,15,0.99))]"
      >
        <div className="overflow-hidden rounded-[24px] border border-border/60">
          <div className="rounded-b-[20px] bg-background/95 pb-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-background">
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

            <div className="px-0 pb-1 pt-2.5">
              {overview?.partial_failures.length ? (
                <div className="mx-4 mb-2.5 flex items-start gap-3 rounded-[16px] bg-muted/45 px-4 py-3 text-sm text-foreground">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div className="line-clamp-2">
                    {overview.partial_failures.map((issue) => `${issue.provider_label}: ${issue.message}`).join(" · ")}
                  </div>
                </div>
              ) : null}

              <div>
                <ScrollArea className="h-[min(62vh,560px)]" scrollbarGutter>
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
                        onSaveManualSetup={saveProviderManualSetup}
                        savingManualSetupProviderId={savingManualSetupProviderId}
                      />
                    </div>
                  ) : selectedProvider ? (
                    <div className="px-4">
                      <ProviderDetail
                        provider={selectedProvider}
                        onToggleProvider={toggleProviderSwitch}
                        onSaveManualSetup={saveProviderManualSetup}
                        isSavingManualSetup={savingManualSetupProviderId === selectedProvider.id}
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

          <div className="px-0 pb-3 pt-3">
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
                          <RefreshCcw className={cn("size-3", isRefreshing && "animate-spin")} />
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
                <div className="inline-flex items-center gap-2">
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

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center text-muted-foreground/80 transition-colors hover:text-foreground"
                        aria-label="Reference sources"
                      >
                        <BookMarked className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center">
                      Reference CodexBar &amp; OpenUsage
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
    </TooltipProvider>
  );
}
