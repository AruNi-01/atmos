"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";

import { cn } from "@workspace/ui";

import type { UsageAggregateResponse, UsageProviderResponse } from "@/api/ws-api";

import {
  displayMetricUsedText,
  displayResetText,
  extraSections,
  extractPercent,
  extractResetText,
  firstRowValue,
  inferProviderRegion,
  providerIdentity,
  sectionHeaderValue,
  usageMetrics,
  visibleSectionRows,
} from "./usage-popover-utils";
import {
  ProviderApiKeyManager,
  ProviderGlyph,
  UsageBar,
  UsagePortalLink,
  UsageSwitch,
} from "./usage-popover-components";

type ProviderSwitchHandler = (providerId: string, enabled: boolean) => void;
type ApiKeyAddHandler = (providerId: string, region: string, apiKey: string) => void;
type ApiKeyDeleteHandler = (providerId: string, keyId: string) => void;

export function AggregateDetail({
  aggregate,
  providers,
  providerOrder,
  onToggleAllProviders,
  onToggleProvider,
  onAddApiKey,
  onDeleteApiKey,
  isAllSwitching,
  savingManualSetupProviderId,
  deletingKeyId,
  switchingProviderId,
}: {
  aggregate: UsageAggregateResponse;
  providers: UsageProviderResponse[];
  providerOrder: string[];
  onToggleAllProviders: (enabled: boolean) => void;
  onToggleProvider: ProviderSwitchHandler;
  onAddApiKey: ApiKeyAddHandler;
  onDeleteApiKey: ApiKeyDeleteHandler;
  isAllSwitching: boolean;
  savingManualSetupProviderId: string | null;
  deletingKeyId: string | null;
  switchingProviderId: string | null;
}) {
  const providerOrderIndex = useMemo(
    () => new Map(providerOrder.map((id, index) => [id, index])),
    [providerOrder],
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
              onAddApiKey={onAddApiKey}
              onDeleteApiKey={onDeleteApiKey}
              isSavingManualSetup={savingManualSetupProviderId === provider.id}
              deletingKeyId={deletingKeyId}
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
  onAddApiKey,
  onDeleteApiKey,
  isSavingManualSetup,
  deletingKeyId,
  isSwitching,
}: {
  provider: UsageProviderResponse;
  onToggleProvider: ProviderSwitchHandler;
  onAddApiKey: ApiKeyAddHandler;
  onDeleteApiKey: ApiKeyDeleteHandler;
  isSavingManualSetup: boolean;
  deletingKeyId: string | null;
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
  const collapsedSubtitle =
    planLabel ??
    (accountLabel && accountLabel !== provider.label ? accountLabel : null);
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
            {collapsedSubtitle ? (
              <div className="truncate text-[11px] text-foreground/90">{collapsedSubtitle}</div>
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
                <DetectedProviderDetails
                  provider={provider}
                  accountLabel={accountLabel}
                  periodLabel={periodLabel}
                  metrics={metrics}
                  extraDetailSections={extraDetailSections}
                  providerRegion={providerRegion}
                  creditsBalance={creditsBalance}
                  creditsState={creditsState}
                  onAddApiKey={onAddApiKey}
                  onDeleteApiKey={onDeleteApiKey}
                  isSavingManualSetup={isSavingManualSetup}
                  deletingKeyId={deletingKeyId}
                />
              ) : (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">Detection required</div>
                  <div className="text-[11px] leading-5 text-foreground/90">{detectHint}</div>
                  <div className="rounded-[12px] bg-muted/35 px-3 py-2 text-[11px] leading-5 text-foreground/90">
                    {provider.auth_state.setup_hint ??
                      "Sign in to the local app or add a supported local token/config so Atmos can detect this provider."}
                  </div>
                  {provider.manual_setup ? (
                    <ProviderApiKeyManager
                      providerId={provider.id}
                      manualSetup={provider.manual_setup}
                      onAddKey={onAddApiKey}
                      onDeleteKey={onDeleteApiKey}
                      isSaving={isSavingManualSetup}
                      deletingKeyId={deletingKeyId}
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

function DetectedProviderDetails({
  provider,
  accountLabel,
  periodLabel,
  metrics,
  extraDetailSections,
  providerRegion,
  creditsBalance,
  creditsState,
  onAddApiKey,
  onDeleteApiKey,
  isSavingManualSetup,
  deletingKeyId,
}: {
  provider: UsageProviderResponse;
  accountLabel: string;
  periodLabel: string | null;
  metrics: ReturnType<typeof usageMetrics>;
  extraDetailSections: ReturnType<typeof extraSections>;
  providerRegion: ReturnType<typeof inferProviderRegion>;
  creditsBalance: string | null;
  creditsState: string | null;
  onAddApiKey: ApiKeyAddHandler;
  onDeleteApiKey: ApiKeyDeleteHandler;
  isSavingManualSetup: boolean;
  deletingKeyId: string | null;
}) {
  return (
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
                    ? displayResetText(metric.resetText, provider.subscription_summary?.reset_at)
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

        <ExtraDetailSections provider={provider} sections={extraDetailSections} compact />
      </div>

      {provider.manual_setup ? (
        <div className="mt-3.5 border-t border-border/60 pt-3">
          <ProviderApiKeyManager
            providerId={provider.id}
            manualSetup={provider.manual_setup}
            onAddKey={onAddApiKey}
            onDeleteKey={onDeleteApiKey}
            isSaving={isSavingManualSetup}
            deletingKeyId={deletingKeyId}
          />
        </div>
      ) : null}
    </>
  );
}

export function ProviderDetail({
  provider,
  onToggleProvider,
  onAddApiKey,
  onDeleteApiKey,
  isSavingManualSetup,
  deletingKeyId,
  isSwitching,
}: {
  provider: UsageProviderResponse;
  onToggleProvider: ProviderSwitchHandler;
  onAddApiKey: ApiKeyAddHandler;
  onDeleteApiKey: ApiKeyDeleteHandler;
  isSavingManualSetup: boolean;
  deletingKeyId: string | null;
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
        </section>
      ) : null}

      <ExtraDetailSections provider={provider} sections={extraDetailSections} />

      {provider.manual_setup ? (
        <section className="border-t border-border/70 pt-5">
          <ProviderApiKeyManager
            providerId={provider.id}
            manualSetup={provider.manual_setup}
            onAddKey={onAddApiKey}
            onDeleteKey={onDeleteApiKey}
            isSaving={isSavingManualSetup}
            deletingKeyId={deletingKeyId}
          />
        </section>
      ) : null}
    </div>
  );
}

function ExtraDetailSections({
  provider,
  sections,
  compact = false,
}: {
  provider: UsageProviderResponse;
  sections: ReturnType<typeof extraSections>;
  compact?: boolean;
}) {
  return (
    <>
      {sections.map((section) => (
        <section
          key={section.title}
          className={compact ? "border-t border-border/60 pt-2.5" : "border-t border-border/70 pt-5"}
        >
          <div className="flex items-start justify-between gap-4">
            <div className={compact ? "text-sm font-medium text-foreground" : "text-[18px] font-semibold tracking-tight text-foreground"}>
              {section.title}
            </div>
            {sectionHeaderValue(provider, section) ? (
              <div className={compact ? "text-right text-[11px] text-foreground/90" : "pt-1 text-right text-sm text-foreground/90"}>
                {sectionHeaderValue(provider, section)}
              </div>
            ) : null}
          </div>
          <div className={compact ? "mt-2 space-y-1.5" : "mt-3 space-y-2"}>
            {visibleSectionRows(provider, section).map((row) => {
              const rowPercent = extractPercent(row.value);
              const rowResetText = extractResetText(row.value);
              const displayValue = rowResetText
                ? row.value.replace(/\s*·\s*resets in[^·]*/i, "").trim()
                : row.value;
              return (
                <div key={`${section.title}:${row.label}`}>
                  <div className={compact ? "flex items-start justify-between gap-4 text-[11px]" : "flex items-start justify-between gap-4 text-sm"}>
                    <div className="text-foreground/90">{row.label}</div>
                    <div className="text-right text-foreground">{displayValue}</div>
                  </div>
                  {rowPercent !== null ? (
                    <div className={compact ? "mt-1" : "mt-1.5"}>
                      <UsageBar percent={rowPercent} />
                    </div>
                  ) : null}
                  {rowPercent !== null ? (
                    <div className={compact ? "mt-0.5 flex items-center justify-between gap-4 text-[11px]" : "mt-1 flex items-center justify-between gap-4 text-[11px]"}>
                      <div />
                      <div className="text-foreground/90">{rowResetText}</div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
