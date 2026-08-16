import type { QuotaProviderResponse } from "@/api/ws-api";

export type QuotaProviderOrderItem = {
  id: string;
  label: string;
  switch_enabled: boolean;
};

function arrayMoveIds(ids: string[], fromIndex: number, toIndex: number): string[] {
  const next = ids.slice();
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return ids;
  next.splice(toIndex, 0, moved);
  return next;
}

/** Keep switch-enabled ids in front of disabled ids, preserving relative order. */
export function partitionQuotaProviderIdsBySwitch(
  ids: string[],
  switchEnabledIds: Iterable<string>,
): string[] {
  const enabled = new Set(switchEnabledIds);
  const on: string[] = [];
  const off: string[] = [];
  for (const id of ids) {
    if (enabled.has(id)) on.push(id);
    else off.push(id);
  }
  return [...on, ...off];
}

export function sortQuotaProvidersBySwitchAndOrder<T extends QuotaProviderOrderItem>(
  providers: T[],
  providerOrder: string[],
): T[] {
  const orderIndex = new Map(providerOrder.map((id, index) => [id, index]));
  return [...providers].sort((left, right) => {
    if (left.switch_enabled !== right.switch_enabled) {
      return left.switch_enabled ? -1 : 1;
    }
    const leftOrder = orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.label.localeCompare(right.label);
  });
}

/**
 * Reorder from the currently displayed (enabled-first) list, then snap
 * enabled providers back in front of disabled ones.
 */
export function reorderQuotaProvidersKeepingEnabledFirst(
  visualIds: string[],
  activeId: string,
  overId: string,
  switchEnabledIds: Iterable<string>,
): string[] {
  const oldIndex = visualIds.indexOf(activeId);
  const newIndex = visualIds.indexOf(overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return partitionQuotaProviderIdsBySwitch(visualIds, switchEnabledIds);
  }
  return partitionQuotaProviderIdsBySwitch(
    arrayMoveIds(visualIds, oldIndex, newIndex),
    switchEnabledIds,
  );
}

export type QuotaPopoverFormatters = {
  unknownLabel?: string;
  resetUnknownLabel?: string;
  resettingNowLabel?: string;
  resetsInPrefixLabel?: string;
  nextUpdateInLabel?: string;
};

function defaultLocale(): Intl.LocalesArgument | undefined {
  if (typeof document !== "undefined") {
    const documentLocale = document.documentElement.lang?.trim();
    if (documentLocale) return documentLocale;
  }

  if (typeof navigator !== "undefined") {
    if (navigator.languages.length > 0) return navigator.languages;
    if (navigator.language) return navigator.language;
  }

  return undefined;
}

function formatCompactUnit(
  value: number,
  unit: "day" | "hour" | "minute",
  locale?: Intl.LocalesArgument,
): string {
  return new Intl.NumberFormat(locale ?? defaultLocale(), {
    style: "unit",
    unit,
    unitDisplay: "narrow",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactDuration(parts: string[], locale?: Intl.LocalesArgument): string {
  return new Intl.ListFormat(locale ?? defaultLocale(), {
    style: "short",
    type: "unit",
  }).format(parts);
}

function resolveFormatterValue(
  value: string | undefined,
  fallback: string,
): string {
  return value ?? fallback;
}

export function formatTimestamp(
  value?: number | null,
  locale: Intl.LocalesArgument = "en",
  formatters: QuotaPopoverFormatters = {},
): string {
  if (!value) return resolveFormatterValue(formatters.unknownLabel, "Unknown");
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

function formatRelativeReset(
  value?: number | null,
  formatters: QuotaPopoverFormatters = {},
  locale?: Intl.LocalesArgument,
): string {
  if (!value) {
    return resolveFormatterValue(formatters.resetUnknownLabel, "Reset unknown");
  }

  const diffMs = value * 1000 - Date.now();
  if (diffMs <= 0) return resolveFormatterValue(formatters.resettingNowLabel, "Resetting now");

  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    const remHours = hours % 24;
    const duration = formatCompactDuration(
      [formatCompactUnit(days, "day", locale), formatCompactUnit(remHours, "hour", locale)].filter(Boolean),
      locale,
    );
    return `${resolveFormatterValue(formatters.resetsInPrefixLabel, "Resets in")} ${duration}`;
  }
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  const duration = formatCompactDuration(
    [formatCompactUnit(hours, "hour", locale), formatCompactUnit(mins, "minute", locale)].filter(Boolean),
    locale,
  );
  return `${resolveFormatterValue(formatters.resetsInPrefixLabel, "Resets in")} ${duration}`;
}

export function formatNextAutoRefreshHint(
  generatedAt?: number | null,
  intervalMinutes?: number | null,
  nowMs: number = Date.now(),
  formatters: QuotaPopoverFormatters = {},
  locale?: Intl.LocalesArgument,
): { value: string; suffix: string } | null {
  if (!generatedAt || !intervalMinutes) return null;

  const nextUpdateAtMs = generatedAt * 1000 + intervalMinutes * 60_000;
  const diffMs = nextUpdateAtMs - nowMs;
  if (diffMs <= 0) {
    return {
      value: `<${formatCompactUnit(1, "minute", locale)}`,
      suffix: resolveFormatterValue(formatters.nextUpdateInLabel, "Next update in"),
    };
  }

  const remainingMinutes = Math.round(diffMs / 60_000);
  if (remainingMinutes <= 0) {
    return {
      value: `<${formatCompactUnit(1, "minute", locale)}`,
      suffix: resolveFormatterValue(formatters.nextUpdateInLabel, "Next update in"),
    };
  }

  return {
    value: formatCompactUnit(remainingMinutes, "minute", locale),
    suffix: resolveFormatterValue(formatters.nextUpdateInLabel, "Next update in"),
  };
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
  formatters: QuotaPopoverFormatters = {},
  locale?: Intl.LocalesArgument,
): string | null {
  const normalizedResetText = explicitResetText?.trim();
  const looksLikeEnglishResetText = normalizedResetText
    ? /^(reset(?:ting)?(?:\s+unknown|\s+now)?|resets?\s+in)\b/i.test(normalizedResetText)
    : false;

  if (fallbackResetAt && looksLikeEnglishResetText) {
    return formatRelativeReset(fallbackResetAt, formatters, locale);
  }

  if (normalizedResetText) return normalizedResetText;
  if (!fallbackResetAt) return null;
  const fallbackText = formatRelativeReset(fallbackResetAt, formatters, locale);
  return fallbackText === resolveFormatterValue(formatters.resetUnknownLabel, "Reset unknown") ? null : fallbackText;
}

export function displayMetricUsedText(
  metric: QuotaMetricRow,
  usedSuffix = "used",
): string {
  if (metric.percent === null || metric.percent === undefined) {
    return metric.value;
  }

  const amountSuffix = metric.amountText ? ` (${metric.amountText})` : "";
  if (metric.detailText) {
    return `${metric.percent.toFixed(0)}% ${usedSuffix}${amountSuffix} (${metric.detailText})`;
  }
  return `${metric.percent.toFixed(0)}% ${usedSuffix}${amountSuffix}`;
}

export type QuotaMetricRow = {
  label: string;
  value: string;
  percent: number | null;
  amountText: string | null;
  detailText: string | null;
  resetText: string | null;
};

function formatQuotaAmountText(provider: QuotaProviderResponse): string | null {
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
  provider: QuotaProviderResponse,
  sectionTitle: string,
  rowLabel: string,
): string | null {
  const section = provider.detail_sections.find(
    (item) => item.title.toLowerCase() === sectionTitle.toLowerCase(),
  );
  const row = section?.rows.find((item) => item.label.toLowerCase() === rowLabel.toLowerCase());
  return row?.value ?? null;
}

function sectionRows(provider: QuotaProviderResponse, sectionTitle: string) {
  return (
    provider.detail_sections.find(
      (item) => item.title.toLowerCase() === sectionTitle.toLowerCase(),
    )?.rows ?? []
  );
}

export function extraSections(provider: QuotaProviderResponse) {
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
  provider: QuotaProviderResponse,
  section: QuotaProviderResponse["detail_sections"][number],
): string | null {
  if (provider.id !== "zai") return null;
  if (section.title.toLowerCase() !== "mcp details") return null;
  return section.rows.find((row) => row.label.toLowerCase() === "total")?.value ?? null;
}

export function visibleSectionRows(
  provider: QuotaProviderResponse,
  section: QuotaProviderResponse["detail_sections"][number],
) {
  if (provider.id !== "zai") return section.rows;
  if (section.title.toLowerCase() !== "mcp details") return section.rows;
  return section.rows.filter((row) => row.label.toLowerCase() !== "total");
}

export function inferProviderRegion(provider: QuotaProviderResponse): ProviderRegion | null {
  const selectedRegion = provider.manual_setup?.selected_region?.toLowerCase();
  if (selectedRegion === "global" || selectedRegion === "china") {
    return selectedRegion;
  }

  if (provider.id === "minimax") {
    const labels = quotaMetrics(provider).map((metric) => metric.label.toLowerCase());
    const hasGlobal = labels.includes("global");
    const hasChina = labels.includes("china");
    if (hasGlobal && !hasChina) return "global";
    if (hasChina && !hasGlobal) return "china";
    return null;
  }

  if (provider.id === "zai") {
    const labels = [
      ...quotaMetrics(provider).map((metric) => metric.label.toLowerCase()),
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

export function quotaMetrics(provider: QuotaProviderResponse): QuotaMetricRow[] {
  const amountText = formatQuotaAmountText(provider);
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

export function providerIdentity(
  provider: QuotaProviderResponse,
  notDetectedLabel = "Not detected",
) {
  const rawAccount =
    firstRowValue(provider, "Account", "Account") ?? provider.auth_state.source ?? notDetectedLabel;
  const rawPlanValue =
    firstRowValue(provider, "Account", "Plan") ??
    provider.subscription_summary?.plan_label ??
    provider.fetch_state.message;
  const isPlaceholder = (s: string) => s === "No plan data" || s === notDetectedLabel;
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
