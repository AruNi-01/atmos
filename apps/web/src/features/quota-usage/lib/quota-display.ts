import type { QuotaProviderResponse, QuotaOverviewResponse } from "@/api/ws-api";
import {
  providerCreditsLabel,
  quotaMetrics as providerQuotaMetrics,
} from "@/app-shell/quota-popover-utils";

export interface UsageCarouselItem {
  providerId: string;
  label: string;
  text: string;
}

interface QuotaMetricBrief {
  label: string;
  value: string;
  percent: number | null;
}

function compactMetricLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("5") && normalized.includes("hour")) return "5h";
  if (normalized.includes("1") && normalized.includes("week")) return "1w";
  if (normalized.includes("7") && normalized.includes("day")) return "1w";
  if (normalized.includes("month")) return "1m";
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

function quotaMetrics(provider: QuotaProviderResponse): QuotaMetricBrief[] {
  return providerQuotaMetrics(provider).map((metric) => ({
    label: compactMetricLabel(metric.label),
    value: trimUsageValue(metric.value),
    percent: metric.percent,
  }));
}

function formatMetric(metric: QuotaMetricBrief, includeLabel = true): string {
  const prefix = includeLabel ? `${metric.label} ` : "";
  if (metric.percent !== null && metric.percent !== undefined) {
    return `${prefix}${metric.percent.toFixed(0)}% used`;
  }
  if (metric.value) return `${prefix}${metric.value}`;
  return metric.label;
}

function creditsText(provider: QuotaProviderResponse): string | null {
  return providerCreditsLabel(provider);
}

export function formatQuotaCarouselText(provider: QuotaProviderResponse): string {
  const metrics = quotaMetrics(provider);
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

/** Latest fetch failure for the quota UI banner. Prefer a client/network error over stale provider issues. */
export function formatQuotaFetchFailureMessage(
  partialFailures: Array<{ provider_id: string; provider_label: string; message: string }>,
  options?: {
    clientError?: string | null;
    providerIds?: Iterable<string>;
  },
): string | null {
  const clientError = options?.clientError?.trim() || null;
  if (clientError) return clientError;

  const allowed = options?.providerIds ? new Set(options.providerIds) : null;
  const issues = partialFailures.filter(
    (issue) => !allowed || allowed.has(issue.provider_id),
  );
  if (issues.length === 0) return null;
  return issues
    .map((issue) => `${issue.provider_label}: ${issue.message}`)
    .join(" · ");
}

export function buildUsageCarouselItems(
  overview: QuotaOverviewResponse | null
): UsageCarouselItem[] {
  if (!overview) return [];

  return overview.providers
    .filter((provider) => provider.switch_enabled && provider.footer_carousel_show)
    .map((provider) => ({
      providerId: provider.id,
      label: provider.label,
      text: formatQuotaCarouselText(provider),
    }));
}
