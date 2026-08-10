"use client";

import { cn } from "../../lib/utils";
import { SlidingNumber } from "./sliding-number";

/** Parts for a SlidingNumber + static prefix/suffix (e.g. `$` + `11.2` + `K`). */
export type SlidingMetricParts = {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  decimalSeparator?: string;
};

export type SlidingMetricProps = SlidingMetricParts & {
  className?: string;
};

/** Locale-aware decimal separator (falls back to `.`). */
export function localeDecimalSeparator(locale?: string): string {
  try {
    const sample = (1.1).toLocaleString(locale || undefined);
    const match = sample.match(/\d(\D)\d/);
    return match?.[1] || ".";
  } catch {
    return ".";
  }
}

function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  if (decimals <= 0) return Math.round(value);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Compact SI-style parts (K / M / B). For `zh*` locales uses 万 / 亿.
 * Keeps mantissa small so SlidingNumber stays readable.
 */
export function compactSlidingParts(
  value: number,
  locale = "en",
): SlidingMetricParts {
  const decimalSeparator = localeDecimalSeparator(locale);
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  const sign = safe < 0 ? -1 : 1;
  const isZh = locale.toLowerCase().startsWith("zh");

  if (isZh) {
    if (abs >= 100_000_000) {
      return {
        value: roundTo((sign * abs) / 100_000_000, 1),
        suffix: "亿",
        decimals: 1,
        decimalSeparator,
      };
    }
    if (abs >= 10_000) {
      const decimals = abs >= 100_000 ? 0 : 1;
      return {
        value: roundTo((sign * abs) / 10_000, decimals),
        suffix: "万",
        decimals,
        decimalSeparator,
      };
    }
  } else {
    if (abs >= 1_000_000_000) {
      return {
        value: roundTo((sign * abs) / 1_000_000_000, 1),
        suffix: "B",
        decimals: 1,
        decimalSeparator,
      };
    }
    if (abs >= 1_000_000) {
      return {
        value: roundTo((sign * abs) / 1_000_000, 1),
        suffix: "M",
        decimals: 1,
        decimalSeparator,
      };
    }
    if (abs >= 1_000) {
      const decimals = abs >= 10_000 ? 0 : 1;
      return {
        value: roundTo((sign * abs) / 1_000, decimals),
        suffix: "K",
        decimals,
        decimalSeparator,
      };
    }
  }

  return {
    value: Math.round(safe),
    decimals: 0,
    decimalSeparator,
  };
}

/** USD compact / detailed sliding parts (matches token-usage currency style). */
export function currencySlidingParts(
  value: number,
  locale = "en",
  mode: "compact" | "detailed" = "compact",
): SlidingMetricParts {
  const decimalSeparator = localeDecimalSeparator(locale);
  const safe = Number.isFinite(value) ? value : 0;

  if (mode === "detailed") {
    const abs = Math.abs(safe);
    const decimals = abs > 0 && abs < 1 ? 4 : 2;
    return {
      prefix: "$",
      value: roundTo(safe, decimals),
      decimals,
      decimalSeparator,
    };
  }

  if (safe > 0 && safe < 1) {
    return {
      prefix: "$",
      value: roundTo(safe, 2),
      decimals: 2,
      decimalSeparator,
    };
  }

  const compact = compactSlidingParts(safe, locale);
  return {
    prefix: "$",
    value: compact.value,
    suffix: compact.suffix,
    decimals: compact.decimals,
    decimalSeparator,
  };
}

/** Percent parts — pass already 0–100 (not 0–1). */
export function percentSlidingParts(
  percent: number,
  locale = "en",
  decimals = 0,
): SlidingMetricParts {
  return {
    value: roundTo(Number.isFinite(percent) ? percent : 0, decimals),
    suffix: "%",
    decimals,
    decimalSeparator: localeDecimalSeparator(locale),
  };
}

/** Detailed integer / locale-rounded sliding (no compact suffix). */
export function detailedSlidingParts(
  value: number,
  locale = "en",
  decimals = 0,
): SlidingMetricParts {
  return {
    value: roundTo(Number.isFinite(value) ? value : 0, decimals),
    decimals,
    decimalSeparator: localeDecimalSeparator(locale),
  };
}

/**
 * Sliding digits with optional static prefix/suffix.
 * Keep this instance mounted across value changes so springs morph digits.
 */
export function SlidingMetric({
  value,
  prefix,
  suffix,
  decimals,
  decimalSeparator = ".",
  className,
}: SlidingMetricProps) {
  return (
    <span
      className={cn(
        // Fixed box so digit-count changes / roll strips don't shove layout
        // (especially inside a pointer-following tooltip).
        "inline-flex items-center justify-end tabular-nums leading-none",
        className,
      )}
    >
      {prefix ? <span className="shrink-0">{prefix}</span> : null}
      <SlidingNumber
        value={value}
        decimals={decimals}
        decimalSeparator={decimalSeparator}
      />
      {suffix ? <span className="shrink-0">{suffix}</span> : null}
    </span>
  );
}
