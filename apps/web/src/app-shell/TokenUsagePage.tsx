"use client";

import * as React from "react";
import { Activity } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { TerminalLoader, cn } from "@workspace/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import type { TokenUsageOverviewResponse } from "@/api/ws/token-usage-api";
import { tokenUsageApi } from "@/api/ws/token-usage-api";
import { permissionAccessApi } from "@/api/ws/permission-access-api";
import { queryKeys } from "@/api/query/query-keys";
import { useComputerQueryScope } from "@/api/query/query-scope";
import { useTokenUsageQuery } from "@/features/quota-usage/hooks/use-token-usage-query";
import { TokenUsageSharePopover } from "@/app-shell/TokenUsageShareDialog";
import { TokenUsageCookieConsentBanner } from "@/app-shell/TokenUsageCookieConsentBanner";
import { TokenUsageOverviewView } from "@/features/token-usage/TokenUsageOverviewView";

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
  const t = useTranslations("appShell.tokenUsageDialog");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const locale = useLocale();

  const tokenUsageQuery = useTokenUsageQuery({ year: null });
  const overview: TokenUsageOverviewResponse | null = tokenUsageQuery.data ?? null;
  const loading = tokenUsageQuery.isLoading && !tokenUsageQuery.data;
  const error = tokenUsageQuery.isError
    ? tokenUsageQuery.error instanceof Error
      ? tokenUsageQuery.error.message
      : t("errors.loadOverviewFallback")
    : null;
  const [consentBusy, setConsentBusy] = React.useState(false);

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

      {loading ? (
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
        <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {error ? (
            <div className="mx-auto mt-4 flex max-w-[1100px] items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-4">
              <Activity className="size-4 shrink-0 text-destructive" />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{t("errors.loadOverviewTitle")}</div>
                <div className={cn("text-xs", muted)}>{error}</div>
              </div>
            </div>
          ) : null}
          <TokenUsageOverviewView
            overview={overview}
            loading={loading}
            captureTargetRef={captureTargetRef}
            toolbarEnd={
              <TokenUsageSharePopover
                captureTargetRef={captureTargetRef}
                locale={locale}
                isDark={isDark}
                totalTokens={overview?.summary.total_tokens ?? 0}
                totalCost={overview?.summary.total_cost_usd ?? null}
                overview={overview}
                disabled={loading || !overview}
              />
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
            items={overview?.browser_cookie_access}
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
