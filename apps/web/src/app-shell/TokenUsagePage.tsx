"use client";

import * as React from "react";
import { Activity } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { TerminalLoader, cn } from "@workspace/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { isPlausibleDeviceCredential } from "@atmos/relay-client";

import type { TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";
import { tokenUsageApi } from "@/api/ws/token-usage-api";
import { permissionAccessApi } from "@/api/ws/permission-access-api";
import { queryKeys } from "@/api/query/query-keys";
import {
  useComputerQueryScope,
  useRelayQueryScope,
} from "@/api/query/query-scope";
import { useTokenUsageQuery } from "@/features/quota-usage/hooks/use-token-usage-query";
import { TokenUsageSharePopover } from "@/app-shell/TokenUsageShareDialog";
import { TokenUsageCookieConsentBanner } from "@/app-shell/TokenUsageCookieConsentBanner";
import { TokenUsageOverviewView } from "@/features/token-usage/TokenUsageOverviewView";
import { TokenUsageComputerSelect } from "@/features/token-usage/TokenUsageComputerSelect";
import { TokenUsageComputerScopeHint } from "@/features/token-usage/TokenUsageComputerScopeHint";
import { fetchLocalComputerStatus } from "@/features/connection/lib/atmos-computer-local";
import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import { fetchAllComputersTokenUsageLive } from "@/features/token-usage/lib/fetch-all-token-usage";
import { fetchRemoteTokenUsageOverviewFromRelay } from "@/features/token-usage/lib/fetch-remote-token-usage";
import {
  ALL_COMPUTERS_VALUE,
  computerScopeHintKind,
  currentUniqueComputer,
  shouldShowComputerSelect,
  uniqueComputers,
  type LocalDeviceInput,
} from "@/features/token-usage/lib/unique-computers";

/** i18n keys under `tokenUsageDialog.loading.tips` — fun status lines while overview loads. */
const TOKEN_USAGE_LOADING_TIP_KEYS = [
  "tallyingAgents",
  "countingLateNight",
  "reconcilingInvoices",
  "tracingCacheHits",
  "weighingInOut",
  "askingAgents",
  "buildingHeatmap",
  "sortingAppetite",
  "estimatingCost",
  "unwindingWindows",
  "negotiatingLedger",
  "polishingBreakdown",
] as const;

const TOKEN_USAGE_LOADING_TIP_INTERVAL_MS = 2800;

function shuffleCopy<T>(items: readonly T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
  }
  return next;
}

function TokenUsageLoadingTips({ className }: { className?: string }) {
  const t = useTranslations("appShell.tokenUsageDialog");
  const tips = React.useMemo(
    () => TOKEN_USAGE_LOADING_TIP_KEYS.map((key) => t(`loading.tips.${key}`)),
    [t],
  );
  const [orderedTips, setOrderedTips] = React.useState(tips);
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    setOrderedTips(shuffleCopy(tips));
    setIndex(0);
  }, [tips]);

  React.useEffect(() => {
    if (orderedTips.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % orderedTips.length);
    }, TOKEN_USAGE_LOADING_TIP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [orderedTips.length]);

  const tip = orderedTips[index] ?? orderedTips[0] ?? "";

  return (
    <div
      className={cn(
        "relative mt-1 flex min-h-[2.75rem] w-full max-w-sm items-start justify-center px-2",
        className,
      )}
      aria-live="polite"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={`${index}-${tip}`}
          initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-x-0 text-center text-xs leading-relaxed tracking-wide"
        >
          {tip}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

export function TokenUsagePage() {
  const captureTargetRef = React.useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const scope = useComputerQueryScope();
  const relayScope = useRelayQueryScope();
  const t = useTranslations("appShell.tokenUsageDialog");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const locale = useLocale();
  const accessToken = useAtmosComputerStore((s) => s.accessToken);
  const computers = useAtmosComputerStore((s) => s.computers);
  const connectionMode = useAtmosComputerStore((s) => s.connectionMode);
  const localServerId = useAtmosComputerStore((s) => s.localServerId);
  const selectedServerId = useAtmosComputerStore((s) => s.selectedServerId);
  const localComputerDisplayName = useAtmosComputerStore(
    (s) => s.localComputerDisplayName,
  );
  const signedIn = isPlausibleDeviceCredential(accessToken);
  const [loopbackDevice, setLoopbackDevice] = React.useState<LocalDeviceInput>(null);
  const [usageSelection, setUsageSelection] = React.useState<string | null>(null);
  const fallbackLocalDevice = React.useMemo<LocalDeviceInput>(
    () => ({
      serverId: localServerId,
      appDeviceId: null,
      displayName: localComputerDisplayName || "Computer",
    }),
    [localComputerDisplayName, localServerId],
  );
  const localDevice: LocalDeviceInput =
    connectionMode === "relay" ? null : (loopbackDevice ?? fallbackLocalDevice);

  React.useEffect(() => {
    if (connectionMode === "relay") return;
    let cancelled = false;
    void fetchLocalComputerStatus()
      .then((status) => {
        if (cancelled) return;
        setLoopbackDevice({
          serverId: status.server_id,
          appDeviceId: status.app_device_id ?? null,
          displayName: status.computer_name || localComputerDisplayName || "Computer",
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLoopbackDevice({
          serverId: localServerId,
          appDeviceId: null,
          displayName: localComputerDisplayName || "Computer",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [connectionMode, localComputerDisplayName, localServerId]);

  const currentServerId =
    connectionMode === "relay" ? selectedServerId : localServerId;
  const devices = React.useMemo(
    () => uniqueComputers(computers, localDevice, currentServerId),
    [computers, currentServerId, localDevice],
  );
  const currentDevice = currentUniqueComputer(devices);
  const showSelect = shouldShowComputerSelect({
    signedIn,
    uniqueCount: devices.length,
  });
  const scopeHintKind = computerScopeHintKind({
    signedIn,
    uniqueCount: devices.length,
  });
  const selectedKey =
    usageSelection === ALL_COMPUTERS_VALUE ||
    (usageSelection != null && devices.some((device) => device.key === usageSelection))
      ? usageSelection
      : (currentDevice?.key ?? ALL_COMPUTERS_VALUE);
  const isAll = showSelect && selectedKey === ALL_COMPUTERS_VALUE;
  const selectedDevice = devices.find((device) => device.key === selectedKey) ?? null;
  const isCurrentScope = !showSelect || selectedDevice?.isCurrent === true;
  const scopedUsageKey = isAll
    ? `${ALL_COMPUTERS_VALUE}:${[...devices.map((device) => device.key)].sort().join(",")}`
    : selectedKey;

  const tokenUsageQuery = useTokenUsageQuery({ year: null });
  const scopedQuery = useQuery({
    queryKey: queryKeys.tokenUsage.scopedOverview(relayScope, scopedUsageKey, {
      year: null,
      since: null,
      until: null,
      clients: null,
      groupBy: null,
    }),
    enabled: showSelect && !isCurrentScope,
    staleTime: 60_000,
    queryFn: async () => {
      if (isAll) {
        return fetchAllComputersTokenUsageLive(
          devices,
          fetchRemoteTokenUsageOverviewFromRelay,
          (name) => t("computerScope.missedComputer", { name }),
        );
      }
      if (!selectedDevice?.serverId) {
        throw new Error(t("computerScope.loadOtherError"));
      }
      return fetchRemoteTokenUsageOverviewFromRelay(selectedDevice.serverId);
    },
  });
  const activeQuery = isCurrentScope ? tokenUsageQuery : scopedQuery;
  const overview: TokenUsageOverviewResponse | null = activeQuery.data ?? null;
  const loading = activeQuery.isLoading && !activeQuery.data;
  const fullPageLoading = isCurrentScope && loading;
  const error = activeQuery.isError
    ? activeQuery.error instanceof Error
      ? activeQuery.error.message === "none-reached"
        ? t("computerScope.noneReached")
        : isCurrentScope
          ? activeQuery.error.message
          : isAll
            ? t("computerScope.noneReached")
            : t("computerScope.loadOtherError")
      : t("errors.loadOverviewFallback")
    : null;
  const [consentBusy, setConsentBusy] = React.useState(false);
  const missedWarnings =
    isAll && overview
      ? overview.partial_warnings.filter((line) => line.trim().length > 0)
      : [];

  const applyOverview = React.useCallback(
    (next: TokenUsageOverviewResponse) => {
      queryClient.setQueryData(
        queryKeys.computer.tokenUsageOverview(scope, {
          year: null,
          since: null,
          until: null,
          clients: null,
          groupBy: null,
        }),
        next,
      );
    },
    [queryClient, scope],
  );

  const handleCookieConsent = React.useCallback(
    async (providerIds: string[], granted: boolean) => {
      setConsentBusy(true);
      try {
        for (const providerId of providerIds) {
          await permissionAccessApi.setConsent(providerId, granted);
        }
        applyOverview(
          await tokenUsageApi.getOverview({
            refresh: granted,
            tryCookies: granted,
            year: null,
          }),
        );
      } catch {
        // Keep the current overview; the banner stays so the user can retry.
      } finally {
        setConsentBusy(false);
      }
    },
    [applyOverview],
  );

  // Soft refresh whenever the page is opened / remounted (async, keep cached UI).
  // Does not upload to Hub — publish is explicit (APP-061 M6).
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await tokenUsageApi.getOverview({
          refresh: true,
          year: null,
        });
        if (cancelled) return;
        applyOverview(next);
      } catch {
        // Keep cached overview on background refresh failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyOverview]);

  const shell = "bg-background text-foreground";
  const muted = isDark ? "text-white/45" : "text-black/45";

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", shell)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.28]"
        style={{
          backgroundImage: isDark
            ? "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)"
            : "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.04) 1px, transparent 0)",
          backgroundSize: "12px 12px",
        }}
      />

      {fullPageLoading ? (
        <div
          className="relative z-[1] flex min-h-0 flex-1 items-center justify-center p-12 select-none"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label={t("heatmap.loadingDescription")}
        >
          <div className="flex flex-col items-center gap-6">
            <TerminalLoader
              rows={5}
              cols={40}
              blockWidth={3}
              speed={50}
              color={isDark ? "text-white" : "text-black"}
              bgColor={isDark ? "bg-white" : "bg-black"}
            />
            <TokenUsageLoadingTips className={muted} />
          </div>
        </div>
      ) : (
        <div
          data-token-usage-page-scroll=""
          className="relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {error ? (
            <div className="mx-auto mt-4 flex max-w-[1100px] items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-4">
              <Activity className="size-4 shrink-0 text-destructive" />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{t("errors.loadOverviewTitle")}</div>
                <div className={cn("text-xs", muted)}>{error}</div>
              </div>
            </div>
          ) : null}
          {missedWarnings.length > 0 ? (
            <div className="mx-auto mt-4 max-w-[1100px] rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
              <div className="font-medium">{t("computerScope.missedBanner")}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {missedWarnings.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <TokenUsageOverviewView
            overview={overview}
            loading={loading}
            captureTargetRef={captureTargetRef}
            toolbarEnd={
              <div className="flex items-center gap-1">
                {showSelect ? (
                  <TokenUsageComputerSelect
                    value={selectedKey}
                    onValueChange={setUsageSelection}
                    devices={devices}
                    allLabel={t("computerScope.allComputers")}
                    isDark={isDark}
                  />
                ) : scopeHintKind ? (
                  <TokenUsageComputerScopeHint kind={scopeHintKind} isDark={isDark} />
                ) : null}
                <TokenUsageSharePopover
                  captureTargetRef={captureTargetRef}
                  locale={locale}
                  isDark={isDark}
                  totalTokens={overview?.summary.total_tokens ?? 0}
                  totalCost={overview?.summary.total_cost_usd ?? null}
                  overview={overview}
                  disabled={loading || !overview}
                />
              </div>
            }
          />
        </div>
      )}

      <div
        data-token-usage-share-exclude=""
        className="pointer-events-none absolute right-4 bottom-4 z-20"
      >
        <div className="pointer-events-auto">
          <TokenUsageCookieConsentBanner
            items={isCurrentScope ? overview?.browser_cookie_access : undefined}
            busy={consentBusy}
            onAllow={(providerIds) => {
              void handleCookieConsent(providerIds, true);
            }}
            onSkip={(providerIds) => {
              void handleCookieConsent(providerIds, false);
            }}
            onEnable={(providerIds) => {
              void handleCookieConsent(providerIds, true);
            }}
          />
        </div>
      </div>
    </div>
  );
}
