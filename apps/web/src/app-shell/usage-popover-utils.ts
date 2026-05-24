import type { UsageProviderResponse } from "@/api/ws-api";

export function formatTimestamp(value?: number | null): string {
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

export function formatNextAutoRefreshHint(
  generatedAt?: number | null,
  intervalMinutes?: number | null,
  nowMs: number = Date.now(),
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

export function formatCountdownDisplay(remainingMs: number): string {
  const safeRemainingMs = Math.max(0, remainingMs);
  const totalMinutes = Math.floor(safeRemainingMs / 60_000);
  const seconds = Math.floor((safeRemainingMs % 60_000) / 1_000);
  const centiseconds = Math.floor((safeRemainingMs % 1_000) / 10);

  return `${totalMinutes.toString().padStart(2, "0")}.${seconds.toString().padStart(2, "0")}.${centiseconds
    .toString()
    .padStart(2, "0")}`;
}

export function extractPercent(text?: string | null): number | null {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)%\s*used/i);
  if (!match) return null;
  return Number(match[1]);
}

export function extractResetText(text?: string | null): string | null {
  if (!text) return null;
  const parts = text
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
  const resetPart = parts.findLast((part) => /^reset/i.test(part));
  return resetPart ?? null;
}

function extractMetricDetail(text?: string | null): string | null {
  if (!text) return null;
  const parts = text
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const detailParts = parts.slice(1).filter((part) => !/^reset/i.test(part));
  return detailParts[0] ?? null;
}

export function displayResetText(
  explicitResetText?: string | null,
  fallbackResetAt?: number | null,
): string | null {
  if (explicitResetText) return explicitResetText;
  if (!fallbackResetAt) return null;
  const fallbackText = formatRelativeReset(fallbackResetAt);
  return fallbackText === "Reset unknown" ? null : fallbackText;
}

export function displayMetricUsedText(metric: UsageMetricRow): string {
  if (metric.percent === null || metric.percent === undefined) {
    return metric.value;
  }
  const amountSuffix = metric.amountText ? ` (${metric.amountText})` : "";
  if (metric.detailText) {
    return `${metric.percent.toFixed(0)}% used${amountSuffix} (${metric.detailText})`;
  }
  return `${metric.percent.toFixed(0)}% used${amountSuffix}`;
}

export type UsageMetricRow = {
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

export type ProviderRegion = "global" | "china";

export function firstRowValue(
  provider: UsageProviderResponse,
  sectionTitle: string,
  rowLabel: string,
): string | null {
  const section = provider.detail_sections.find(
    (item) => item.title.toLowerCase() === sectionTitle.toLowerCase(),
  );
  const row = section?.rows.find((item) => item.label.toLowerCase() === rowLabel.toLowerCase());
  return row?.value ?? null;
}

function sectionRows(provider: UsageProviderResponse, sectionTitle: string) {
  return (
    provider.detail_sections.find(
      (item) => item.title.toLowerCase() === sectionTitle.toLowerCase(),
    )?.rows ?? []
  );
}

export function extraSections(provider: UsageProviderResponse) {
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

export function sectionHeaderValue(
  provider: UsageProviderResponse,
  section: UsageProviderResponse["detail_sections"][number],
): string | null {
  if (provider.id !== "zai") return null;
  if (section.title.toLowerCase() !== "mcp details") return null;
  return section.rows.find((row) => row.label.toLowerCase() === "total")?.value ?? null;
}

export function visibleSectionRows(
  provider: UsageProviderResponse,
  section: UsageProviderResponse["detail_sections"][number],
) {
  if (provider.id !== "zai") return section.rows;
  if (section.title.toLowerCase() !== "mcp details") return section.rows;
  return section.rows.filter((row) => row.label.toLowerCase() !== "total");
}

export function inferProviderRegion(provider: UsageProviderResponse): ProviderRegion | null {
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
      (label) => label === "tokens" || label === "mcp" || label === "mcp details",
    );
    if (hasGlobal && !hasChina) return "global";
    if (hasChina && !hasGlobal) return "china";
  }

  return null;
}

export function usagePortalUrl(providerId: string, region: ProviderRegion | null): string | null {
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

export function usageMetrics(provider: UsageProviderResponse): UsageMetricRow[] {
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

export function providerIdentity(provider: UsageProviderResponse) {
  const rawAccount =
    firstRowValue(provider, "Account", "Account") ?? provider.auth_state.source ?? "Not detected";
  const rawPlanValue =
    firstRowValue(provider, "Account", "Plan") ??
    provider.subscription_summary?.plan_label ??
    provider.fetch_state.message;
  const isPlaceholder = (s: string) => s === "No plan data" || s === "Not detected";
  const rawPlan = rawPlanValue && !isPlaceholder(rawPlanValue) ? rawPlanValue : null;
  const genericAccount = rawAccount.trim().toLowerCase() === provider.label.trim().toLowerCase();
  const accountLabel = genericAccount && rawPlan ? rawPlan : rawAccount;
  const periodLabel =
    firstRowValue(provider, "Usage", "Billing period") ??
    firstRowValue(provider, "Account", "Period") ??
    null;
  const planLabel = rawPlan && rawPlan !== accountLabel ? rawPlan : null;
  return { accountLabel, planLabel, periodLabel };
}
