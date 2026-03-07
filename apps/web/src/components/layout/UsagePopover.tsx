"use client";

import React, { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  BookMarked,
  ChevronDown,
  CircleHelp,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@workspace/ui";

import {
  usageWsApi,
  type UsageAggregateResponse,
  type UsageManualSetupResponse,
  type UsageOverviewResponse,
  type UsageProviderResponse,
} from "@/api/ws-api";

const STALE_MS = 3 * 60 * 1000;
const ALL_PROVIDER_ID = "all";
const ALL_PROVIDER_SWITCH_ID = "__all_providers_switch__";

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
  if (metric.detailText) {
    return `${metric.percent.toFixed(0)}% used (${metric.detailText})`;
  }
  return `${metric.percent.toFixed(0)}% used`;
}

type UsageMetricRow = {
  label: string;
  value: string;
  percent: number | null;
  detailText: string | null;
  resetText: string | null;
};

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
  return sectionRows(provider, "Usage")
    .filter((row) => Boolean(row.value?.trim()))
    .map((row, index) => ({
      label: row.label,
      value: row.value,
      percent:
        extractPercent(row.value) ??
        (index === 0 ? (provider.usage_summary?.percent ?? null) : null),
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
  const planLabel = rawPlan && rawPlan !== accountLabel ? rawPlan : null;
  return { accountLabel, planLabel };
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
  ]);

  if (!iconIds.has(providerId)) {
    return <Coins className={iconClass} />;
  }

  return (
    <span
      aria-hidden="true"
      className="size-[26px] shrink-0 select-none bg-current"
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
  onClick,
}: {
  id: string;
  label: string;
  selected: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "group relative flex w-[64px] shrink-0 flex-col items-center gap-1.5 rounded-[16px] px-1.5 py-2.5 transition-all duration-200",
        selected
          ? "bg-foreground text-background shadow-[0_14px_30px_-18px_rgba(0,0,0,0.45)]"
          : active
            ? "text-foreground/85 hover:bg-muted/55"
            : "text-muted-foreground/55 hover:bg-muted/45 hover:text-muted-foreground"
      )}
    >
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-[14px] border transition-all duration-200",
          selected
            ? "border-background/20 bg-background/12 text-background"
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
          selected ? "text-background" : active ? "text-foreground/85" : "text-muted-foreground/55"
        )}
      >
        {label}
      </div>
    </button>
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
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
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
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              API Key
            </div>
            {manualSetup.api_key_configured ? (
              <div className="text-[10px] text-muted-foreground">Stored locally</div>
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
  onToggleAllProviders,
  onToggleProvider,
  onSaveManualSetup,
  isAllSwitching,
  savingManualSetupProviderId,
  switchingProviderId,
}: {
  aggregate: UsageAggregateResponse;
  providers: UsageProviderResponse[];
  onToggleAllProviders: (enabled: boolean) => void;
  onToggleProvider: (providerId: string, enabled: boolean) => void;
  onSaveManualSetup: (providerId: string, region: string, apiKey: string) => void;
  isAllSwitching: boolean;
  savingManualSetupProviderId: string | null;
  switchingProviderId: string | null;
}) {
  const sortedProviders = [...providers].sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
    if (left.switch_enabled !== right.switch_enabled) return left.switch_enabled ? -1 : 1;
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
        <div className="text-sm font-medium text-muted-foreground">
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
        <div className="rounded-[16px] border border-border/60 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
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
  const { accountLabel, planLabel } = providerIdentity(provider);
  const periodLabel = firstRowValue(provider, "Account", "Period");
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
                  aria-label={`${provider.label} refresh switch`}
                />
              </div>
            </div>
            {planLabel ? (
              <div className="truncate text-[11px] text-muted-foreground">{planLabel}</div>
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
            <div className="text-[11px] text-muted-foreground">
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
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {periodLabel}
                    </div>
                  ) : null}
                  <UsagePortalLink
                    providerId={provider.id}
                    region={providerRegion}
                    className="mt-1"
                  />
                </div>
                <div className="text-right text-[11px] text-muted-foreground">
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
                        <div className="text-muted-foreground">
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
                    <div className="mt-1 text-[11px] text-muted-foreground">No usage data</div>
                  </div>
                )}

                {creditsBalance || creditsState ? (
                  <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-2.5 text-sm">
                    <div className="text-foreground">Credits</div>
                    <div className="text-right">
                      <div className="text-foreground">{creditsBalance ?? "Unknown"}</div>
                      <div className="text-[11px] text-muted-foreground">{creditsState ?? "Credits"}</div>
                    </div>
                  </div>
                ) : null}

                {extraDetailSections.map((section) => (
                  <div key={section.title} className="border-t border-border/60 pt-2.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="text-sm font-medium text-foreground">{section.title}</div>
                      {sectionHeaderValue(provider, section) ? (
                        <div className="text-right text-[11px] text-muted-foreground">
                          {sectionHeaderValue(provider, section)}
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {visibleSectionRows(provider, section).map((row) => (
                        <div key={`${section.title}:${row.label}`} className="flex items-start justify-between gap-4 text-[11px]">
                          <div className="text-muted-foreground">{row.label}</div>
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
              <div className="text-[11px] leading-5 text-muted-foreground">{detectHint}</div>
              <div className="rounded-[12px] bg-muted/35 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
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
  const { accountLabel, planLabel } = providerIdentity(provider);
  const periodLabel = firstRowValue(provider, "Account", "Period");
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
                aria-label={`${provider.label} refresh switch`}
              />
            </div>
            {periodLabel ? (
              <div className="mt-1 text-sm text-muted-foreground">{periodLabel}</div>
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
              <div className="mt-1 text-sm text-muted-foreground">{planLabel}</div>
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
            <div className="text-muted-foreground">
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
            <div className="text-muted-foreground">{creditsState && creditsBalance ? creditsState : null}</div>
          </div>
          {warningText ? (
            <div className="mt-3 text-sm leading-6 text-muted-foreground">{warningText}</div>
          ) : null}
        </section>
      ) : warningText ? (
        <section className="border-t border-border/70 pt-5">
          <div className="text-sm leading-6 text-muted-foreground">{warningText}</div>
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
              <div className="pt-1 text-right text-sm text-muted-foreground">
                {sectionHeaderValue(provider, section)}
              </div>
            ) : null}
          </div>
          <div className="mt-3 space-y-2">
            {visibleSectionRows(provider, section).map((row) => (
              <div key={`${section.title}:${row.label}`} className="flex items-start justify-between gap-4 text-sm">
                <div className="text-muted-foreground">{row.label}</div>
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

export function UsagePopover() {
  const [open, setOpen] = useState(false);
  const [overview, setOverview] = useState<UsageOverviewResponse | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(ALL_PROVIDER_ID);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [switchingProviderId, setSwitchingProviderId] = useState<string | null>(null);
  const [savingManualSetupProviderId, setSavingManualSetupProviderId] = useState<string | null>(null);
  const [showRefreshAction, setShowRefreshAction] = useState(false);
  const [refreshSwapDirection, setRefreshSwapDirection] = useState<1 | -1>(1);

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
      setLastLoadedAt(Date.now());
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
      setLastLoadedAt(Date.now());
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
      setLastLoadedAt(Date.now());
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
        setLastLoadedAt(Date.now());
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
    const stale = !lastLoadedAt || Date.now() - lastLoadedAt > STALE_MS;
    if (!overview || stale) {
      void loadOverview(Boolean(overview && stale));
    }
  }, [open, overview, lastLoadedAt, loadOverview]);

  useEffect(() => {
    if (selectedProviderId === ALL_PROVIDER_ID) return;
    if (overview && !overview.providers.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(ALL_PROVIDER_ID);
    }
  }, [overview, selectedProviderId]);

  const switches = useMemo(
    () => [
      {
        id: ALL_PROVIDER_ID,
        label: "All",
        active: (overview?.providers ?? []).some((provider) => provider.switch_enabled),
      },
      ...((overview?.providers ?? []).map((provider) => ({
        id: provider.id,
        label: provider.label,
        active: provider.switch_enabled,
      }))),
    ],
    [overview]
  );

  const displayedUpdatedAt =
    selectedProviderId === ALL_PROVIDER_ID
      ? overview?.generated_at
      : selectedProvider?.last_updated_at ?? overview?.generated_at;

  const refreshSwapVariants = {
    initial: (direction: 1 | -1) => ({
      opacity: 0,
      x: direction === 1 ? -8 : 8,
    }),
    animate: {
      opacity: 1,
      x: 0,
    },
    exit: (direction: 1 | -1) => ({
      opacity: 0,
      x: direction === 1 ? 8 : -8,
    }),
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Usage"
          className="size-8 flex items-center justify-center rounded-md text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground"
        >
          <Gauge className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(92vw,560px)] rounded-[24px] border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(244,244,245,0.985))] p-0 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.30)] dark:bg-[linear-gradient(180deg,rgba(30,30,30,0.98),rgba(15,15,15,0.99))]"
      >
        <div className="overflow-hidden rounded-[24px] border border-border/60">
          <div className="px-3 pb-1.5 pt-2.5">
            <ScrollArea className="w-full" scrollbarGutter>
              <div className="flex w-max items-start gap-1 pb-0.5">
                {switches.map((item) => (
                  <ProviderSwitch
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    active={item.active}
                    selected={selectedProviderId === item.id}
                    onClick={() => startTransition(() => setSelectedProviderId(item.id))}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="px-0 pb-2.5 pt-2">
            {overview?.partial_failures.length ? (
              <div className="mx-4 mb-2.5 flex items-start gap-3 rounded-[16px] bg-muted/45 px-4 py-3 text-sm text-foreground">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <div className="line-clamp-2">
                  {overview.partial_failures.map((issue) => `${issue.provider_label}: ${issue.message}`).join(" · ")}
                </div>
              </div>
            ) : null}

            <div className="rounded-[20px] bg-background/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
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
                    <div className="px-4 text-sm text-muted-foreground">Select a provider to inspect usage.</div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 px-4 text-xs text-muted-foreground">
              <div
                className="flex items-center"
                onMouseEnter={() => {
                  setRefreshSwapDirection(1);
                  setShowRefreshAction(true);
                }}
                onMouseLeave={() => {
                  setRefreshSwapDirection(-1);
                  setShowRefreshAction(false);
                }}
              >
                <div className="relative h-7 w-[148px]">
                  <AnimatePresence mode="wait" initial={false} custom={refreshSwapDirection}>
                    {showRefreshAction ? (
                      <motion.button
                        key="refresh-button"
                        custom={refreshSwapDirection}
                        type="button"
                        onClick={() =>
                          void loadOverview(
                            true,
                            selectedProviderId === ALL_PROVIDER_ID ? null : selectedProviderId
                          )
                        }
                        variants={refreshSwapVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="absolute left-0 top-0 inline-flex h-7 items-center justify-center gap-1 rounded-sm border border-border/70 bg-background/85 px-2 py-1 hover:border-foreground/20 hover:text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={isRefreshing}
                        aria-label="Refresh usage"
                      >
                        <RefreshCcw className={cn("size-3", isRefreshing && "animate-spin")} />
                        <span className="text-[10px] font-medium">Refresh</span>
                      </motion.button>
                    ) : (
                      <motion.span
                        key="updated-time"
                        custom={refreshSwapDirection}
                        variants={refreshSwapVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="absolute inset-0 inline-flex h-7 w-full items-center whitespace-nowrap"
                      >
                        {error && overview ? error : `Updated ${formatTimestamp(displayedUpdatedAt)}`}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <TooltipProvider delayDuration={180}>
                <div className="inline-flex items-center gap-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Why Keychain Access may be needed"
                      >
                        <CircleHelp className="size-3.5" />
                        <span>Keychain Access</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="end" className="max-w-[260px]">
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
                    <TooltipContent side="top" align="end">
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
  );
}
