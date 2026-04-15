import type { UsageProviderResponse, UsageOverviewResponse } from "@/api/ws-api";

export interface UsageCarouselItem {
  providerId: string;
  label: string;
  text: string;
}

interface UsageMetricBrief {
  label: string;
  value: string;
  percent: number | null;
}

function sectionRows(provider: UsageProviderResponse, sectionTitle: string) {
  return provider.detail_sections.find(
    (item) => item.title.toLowerCase() === sectionTitle.toLowerCase()
  )?.rows ?? [];
}

function firstRowValue(
  provider: UsageProviderResponse,
  sectionTitle: string,
  rowLabel: string
): string | null {
  const row = sectionRows(provider, sectionTitle).find(
    (item) => item.label.toLowerCase() === rowLabel.toLowerCase()
  );
  return row?.value ?? null;
}

function extractPercent(text?: string | null): number | null {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)%\s*used/i);
  if (!match) return null;
  return Number(match[1]);
}

function compactMetricLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("5") && normalized.includes("hour")) return "5h";
  if (normalized.includes("1") && normalized.includes("week")) return "1w";
  if (normalized.includes("7") && normalized.includes("day")) return "1w";
  if (normalized.includes("included")) return "Included";
  if (normalized.includes("on-demand") || normalized.includes("on demand")) return "On Demand";
  return label.replace(/\s+usage$/i, "").trim();
}

function trimUsageValue(value: string): string {
  return value
    .split("·")[0]
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim();
}

function usageMetrics(provider: UsageProviderResponse): UsageMetricBrief[] {
  return sectionRows(provider, "Usage")
    .filter((row) => Boolean(row.value?.trim()))
    .filter((row) => row.label.toLowerCase() !== "billing period")
    .map((row, index) => ({
      label: compactMetricLabel(row.label),
      value: trimUsageValue(row.value),
      percent: extractPercent(row.value) ?? (index === 0 ? provider.usage_summary?.percent ?? null : null),
    }));
}

function formatMetric(metric: UsageMetricBrief, includeLabel = true): string {
  const prefix = includeLabel ? `${metric.label} ` : "";
  if (metric.percent !== null && metric.percent !== undefined) {
    return `${prefix}${metric.percent.toFixed(0)}% used`;
  }
  if (metric.value) return `${prefix}${metric.value}`;
  return metric.label;
}

function creditsText(provider: UsageProviderResponse): string | null {
  const balance = firstRowValue(provider, "Credits", "Balance");
  if (balance) return balance;
  const summary = provider.subscription_summary?.credits_label;
  return summary?.trim() || null;
}

export function formatUsageCarouselText(provider: UsageProviderResponse): string {
  const metrics = usageMetrics(provider);
  const credit = creditsText(provider);

  if (!provider.enabled) {
    return `${provider.label}: Not detected`;
  }

  if (metrics.length === 0) {
    return `${provider.label}: ${credit ?? provider.fetch_state.message ?? "No usage data"}`;
  }

  const visibleMetrics =
    provider.id === "zai" || provider.id === "minimax" ? metrics.slice(0, 1) : metrics.slice(0, 3);
  const omitSingleMetricLabel = provider.id === "amp" || (
    visibleMetrics.length === 1 && visibleMetrics[0].label.toLowerCase() === "usage"
  );
  const parts = visibleMetrics.map((metric) => formatMetric(metric, !omitSingleMetricLabel));

  if (credit && provider.id !== "cursor") {
    parts.push(credit);
  }

  return `${provider.label}: ${parts.join(", ")}`;
}

export function buildUsageCarouselItems(
  overview: UsageOverviewResponse | null,
  selectedProviderIds: string[]
): UsageCarouselItem[] {
  if (!overview || selectedProviderIds.length === 0) return [];

  const selected = new Set(selectedProviderIds);
  return overview.providers
    .filter((provider) => provider.switch_enabled && selected.has(provider.id))
    .map((provider) => ({
      providerId: provider.id,
      label: provider.label,
      text: formatUsageCarouselText(provider),
    }));
}
