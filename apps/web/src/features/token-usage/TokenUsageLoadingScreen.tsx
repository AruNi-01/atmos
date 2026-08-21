"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { TerminalLoader, cn } from "@workspace/ui";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

/** i18n keys under `tokenUsageDialog.loading.tips`. */
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

/** Full-pane Token Usage load state: TerminalLoader plus rotating tips. */
export function TokenUsageLoadingScreen({ className }: { className?: string }) {
  const t = useTranslations("appShell.tokenUsageDialog");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const muted = isDark ? "text-white/45" : "text-black/45";

  return (
    <div
      className={cn(
        "relative z-[1] flex min-h-0 w-full flex-1 items-center justify-center p-12 select-none",
        className,
      )}
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
  );
}
