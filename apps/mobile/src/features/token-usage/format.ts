/** Hermes often ignores Intl `notation: "compact"`, which spilled full integers across the stat cards. */
export function formatCompactNumber(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const units = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ] as const;
  for (const [divisor, suffix] of units) {
    if (abs >= divisor) {
      const scaled = abs / divisor;
      const digits = scaled >= 100 ? 0 : 1;
      return `${sign}${scaled.toFixed(digits)}${suffix}`;
    }
  }
  if (Number.isInteger(abs)) return `${sign}${abs.toFixed(0)}`;
  return `${sign}${abs.toFixed(1)}`;
}

export function formatCurrencyCompact(value: number | null): string {
  if (value === null) return "--";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs < 1) return `${sign}$${abs.toFixed(1)}`;
  return `${sign}$${formatCompactNumber(abs)}`;
}

export function formatCurrencyDetailed(value: number | null): string {
  if (value === null) return "--";
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 0.01 ? 4 : 2;
  const body = abs.toLocaleString("en", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${value < 0 ? "-" : ""}$${body}`;
}

export function formatMetric(value: number, metric: "tokens" | "cost", mode: "compact" | "detailed" = "compact") {
  if (metric === "cost") {
    return mode === "detailed" ? formatCurrencyDetailed(value) : formatCurrencyCompact(value);
  }
  return mode === "detailed" ? Math.round(value).toLocaleString("en") : formatCompactNumber(value);
}

export function formatPercent(value: number) {
  if (value > 0 && value < 0.1) return "<0.1%";
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}
