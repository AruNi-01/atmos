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
  useDroidToStartLabel?: string;
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

/** Window rows keep a track at 0%. Extra-usage / amount rows stay bar-less. */
export function quotaMetricShowsBar(percent: number | null | undefined): boolean {
  return typeof percent === "number" && Number.isFinite(percent);
}

function isResetOrStartStatusPart(part: string): boolean {
  return /^reset/i.test(part) || /^use droid to start$/i.test(part);
}

export function extractResetText(text?: string | null): string | null {
  if (!text) return null;
  const parts = text
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
  const resetPart = parts.findLast((part) => isResetOrStartStatusPart(part));
  return resetPart ?? null;
}

function extractMetricDetail(text?: string | null): string | null {
  if (!text) return null;
  const parts = text
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const detailParts = parts.slice(1).filter((part) => !isResetOrStartStatusPart(part));
  return detailParts[0] ?? null;
}

function parseEnglishResetDuration(
  text: string,
): { days: number; hours: number; minutes: number } | null {
  const match = text
    .trim()
    .match(
      /^resets?\s+in\s+(?:(\d+)\s*d(?:ays?)?)?\s*,?\s*(?:(\d+)\s*h(?:ours?)?)?\s*,?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/i,
    );
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  return {
    days: match[1] ? Number(match[1]) : 0,
    hours: match[2] ? Number(match[2]) : 0,
    minutes: match[3] ? Number(match[3]) : 0,
  };
}

function formatParsedResetDuration(
  duration: { days: number; hours: number; minutes: number },
  formatters: QuotaPopoverFormatters,
  locale?: Intl.LocalesArgument,
): string {
  const parts: string[] = [];
  if (duration.days > 0) {
    parts.push(formatCompactUnit(duration.days, "day", locale));
    if (duration.hours > 0) parts.push(formatCompactUnit(duration.hours, "hour", locale));
  } else if (duration.hours > 0) {
    parts.push(formatCompactUnit(duration.hours, "hour", locale));
    if (duration.minutes > 0) parts.push(formatCompactUnit(duration.minutes, "minute", locale));
  } else {
    parts.push(formatCompactUnit(duration.minutes, "minute", locale));
  }
  return `${resolveFormatterValue(formatters.resetsInPrefixLabel, "Resets in")} ${formatCompactDuration(parts, locale)}`;
}

export function displayResetText(
  explicitResetText?: string | null,
  fallbackResetAt?: number | null,
  formatters: QuotaPopoverFormatters = {},
  locale?: Intl.LocalesArgument,
): string | null {
  const normalizedResetText = explicitResetText?.trim() || "";
  if (/^use droid to start$/i.test(normalizedResetText)) {
    return resolveFormatterValue(formatters.useDroidToStartLabel, "Use Droid to start");
  }

  if (/^reset unknown$/i.test(normalizedResetText)) {
    if (fallbackResetAt) return formatRelativeReset(fallbackResetAt, formatters, locale);
    return resolveFormatterValue(formatters.resetUnknownLabel, "Reset unknown");
  }

  if (/^resetting now$/i.test(normalizedResetText)) {
    return resolveFormatterValue(formatters.resettingNowLabel, "Resetting now");
  }

  const parsedDuration = normalizedResetText
    ? parseEnglishResetDuration(normalizedResetText)
    : null;
  if (parsedDuration) {
    return formatParsedResetDuration(parsedDuration, formatters, locale);
  }

  if (normalizedResetText) return normalizedResetText;
  if (!fallbackResetAt) return null;
  const fallbackText = formatRelativeReset(fallbackResetAt, formatters, locale);
  return fallbackText === resolveFormatterValue(formatters.resetUnknownLabel, "Reset unknown")
    ? null
    : fallbackText;
}

export function displayMetricUsedText(
  metric: QuotaMetricRow,
  usedSuffix = "used",
): string {
  if (metric.percent === null || metric.percent === undefined) {
    return metric.value;
  }

  const amountSuffix = metric.amountText ? ` (${metric.amountText})` : "";
  return `${metric.percent.toFixed(0)}% ${usedSuffix}${amountSuffix}`;
}

export type QuotaMetricSegment = {
  label: string;
  percent: number;
};

/** Distinct fills for a shared-pool split. Same class is used on the bar and legend dot. */
export const USAGE_SEGMENT_FILLS = [
  "bg-info",
  "bg-success",
  "bg-warning",
  "bg-chart-2",
] as const;

export function usageSegmentFillClass(label: string, index: number): string {
  const key = label.trim().toLowerCase();
  if (key === "grok build" || key === "build") return "bg-info";
  if (key === "chat") return "bg-success";
  if (key === "image") return "bg-warning";
  if (key === "voice") return "bg-chart-2";
  return USAGE_SEGMENT_FILLS[index % USAGE_SEGMENT_FILLS.length] ?? "bg-info";
}

export type QuotaMetricRow = {
  group: string | null;
  label: string;
  value: string;
  percent: number | null;
  amountText: string | null;
  detailText: string | null;
  resetText: string | null;
  segments: QuotaMetricSegment[];
};

export type QuotaMetricPresentation = {
  group: string | null;
  label: string;
  /** Right-side value: `13%` for a window, otherwise the row amount/status. */
  valueText: string | null;
  /** Reset countdown only when this row itself is a usage window. */
  resetText: string | null;
  /** Progress to plot; null means no bar (amount, disabled extra usage, bonus, …). */
  percent: number | null;
  /** Product split of a shared pool (Grok Build / Chat / Image). */
  segments: QuotaMetricSegment[];
};

/**
 * Compact per-row view for agent-chat / quota chrome.
 *
 * Window rows (`13% used · resets in 4d`) keep a bar, percent, and reset.
 * Extra usage / prepaid / on-demand dollar rows keep the amount (or Disabled)
 * and do not inherit the subscription window's reset or a 0% bar.
 */
export function presentQuotaMetric(
  metric: QuotaMetricRow,
  options: {
    fallbackResetAt?: number | null;
    locale?: Intl.LocalesArgument;
    formatters?: QuotaPopoverFormatters;
  } = {},
): QuotaMetricPresentation {
  // Own-row percent only. `quotaMetrics` may copy usage_summary.percent onto
  // the first Usage row, which would otherwise paint Extra usage as 0%.
  const percent = extractPercent(metric.value);

  if (percent != null) {
    return {
      group: metric.group,
      label: metric.label,
      valueText: `${Math.round(percent)}%`,
      resetText: displayResetText(
        metric.resetText,
        options.fallbackResetAt,
        options.formatters,
        options.locale,
      ),
      percent,
      segments: metric.segments ?? [],
    };
  }

  const valueText = metric.value.trim() || null;
  return {
    group: metric.group,
    label: metric.label,
    valueText,
    resetText: displayResetText(
      metric.resetText,
      null,
      options.formatters,
      options.locale,
    ),
    percent: null,
    segments: [],
  };
}

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

export const FACTORY_USAGE_MODE_STANDARD = "Standard";
export const FACTORY_USAGE_MODE_DROID_CORE = "Droid Core";
export const FACTORY_MANAGED_COMPUTERS_GROUP = "Managed Computers";

function isUsageMetricSectionTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return (
    normalized === "usage" ||
    normalized === "standard" ||
    normalized === "droid core" ||
    normalized === "core" ||
    normalized === "managed computers"
  );
}

function usageSectionGroup(provider: QuotaProviderResponse, title: string): string | null {
  const normalized = title.trim().toLowerCase();
  if (normalized === "standard") return FACTORY_USAGE_MODE_STANDARD;
  if (normalized === "droid core" || normalized === "core") return FACTORY_USAGE_MODE_DROID_CORE;
  if (normalized === "managed computers") return FACTORY_MANAGED_COMPUTERS_GROUP;
  if (normalized === "usage") {
    const hasCore = provider.detail_sections.some((section) => {
      const sectionTitle = section.title.trim().toLowerCase();
      return sectionTitle === "droid core" || sectionTitle === "core";
    });
    return hasCore ? FACTORY_USAGE_MODE_STANDARD : null;
  }
  return null;
}

export function extraSections(provider: QuotaProviderResponse) {
  return provider.detail_sections.filter((section) => {
    const title = section.title.toLowerCase();
    return (
      title !== "account" &&
      title !== "usage" &&
      title !== "standard" &&
      title !== "droid core" &&
      title !== "core" &&
      title !== "managed computers" &&
      title !== "credits" &&
      title !== "fetch pipeline"
    );
  });
}

export function factoryUsageModes(metrics: Array<Pick<QuotaMetricRow, "group">>): string[] {
  const modes: string[] = [];
  if (metrics.some((metric) => metric.group === FACTORY_USAGE_MODE_STANDARD)) {
    modes.push(FACTORY_USAGE_MODE_STANDARD);
  }
  if (metrics.some((metric) => metric.group === FACTORY_USAGE_MODE_DROID_CORE)) {
    modes.push(FACTORY_USAGE_MODE_DROID_CORE);
  }
  return modes;
}

export function factoryWindowMetrics<T extends Pick<QuotaMetricRow, "group">>(
  metrics: T[],
  mode: string | null,
): T[] {
  const windows = metrics.filter((metric) => metric.group !== FACTORY_MANAGED_COMPUTERS_GROUP);
  if (!mode) return windows;
  const filtered = windows.filter((metric) => metric.group === mode);
  return filtered.length > 0 ? filtered : windows;
}

export function factoryManagedComputerMetrics<T extends Pick<QuotaMetricRow, "group">>(
  metrics: T[],
): T[] {
  return metrics.filter((metric) => metric.group === FACTORY_MANAGED_COMPUTERS_GROUP);
}

export function quotaMetricHeading(label: string, usedText: string): string {
  if (!usedText.trim()) return label;
  if (!label.trim()) return usedText;
  return `${label} · ${usedText}`;
}

export function metricRowKey(metric: Pick<QuotaMetricRow, "group" | "label">): string {
  return metric.group ? `${metric.group}:${metric.label}` : metric.label;
}

export function shouldShowMetricGroup(
  metrics: Array<Pick<QuotaMetricRow, "group">>,
  index: number,
): boolean {
  const groups = new Set(metrics.map((metric) => metric.group).filter(Boolean));
  if (groups.size < 2) return false;
  const current = metrics[index]?.group;
  if (!current) return false;
  return current !== metrics[index - 1]?.group;
}

export function metricGroupLabel(
  group: string,
  labels: { standard: string; droidCore: string },
): string {
  const normalized = group.trim().toLowerCase();
  if (normalized === "standard") return labels.standard;
  if (normalized === "droid core" || normalized === "core") return labels.droidCore;
  return group;
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

  if (providerId === "deepseek") {
    return "https://platform.deepseek.com";
  }

  if (providerId === "factory") {
    return "https://app.factory.ai/settings/usage";
  }

  return null;
}

function isNonWindowUsageLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return (
    normalized === "extra usage" ||
    normalized.includes("prepaid") ||
    normalized.includes("on-demand") ||
    normalized.includes("on demand")
  );
}

/**
 * Grok SuperGrok is one shared weekly/monthly pool. Product rows
 * (`Grok Build 5% used`, `Chat 1% used`) are a split of that bar, not
 * independent quotas. Fold them onto the window row as segments.
 */
function foldSharedPoolSegments(
  providerId: string,
  rows: QuotaMetricRow[],
): QuotaMetricRow[] {
  if (providerId !== "grok") return rows;

  const folded: QuotaMetricRow[] = [];
  for (const row of rows) {
    const last = folded.at(-1);
    const sharedPercent = row.percent;
    if (
      last &&
      last.percent != null &&
      sharedPercent != null &&
      !row.resetText &&
      !isNonWindowUsageLabel(row.label)
    ) {
      last.segments.push({ label: row.label, percent: sharedPercent });
      continue;
    }
    folded.push({ ...row, segments: [...row.segments] });
  }
  return folded;
}

export function quotaMetrics(provider: QuotaProviderResponse): QuotaMetricRow[] {
  const amountText = formatQuotaAmountText(provider);
  const rows: QuotaMetricRow[] = [];
  for (const section of provider.detail_sections) {
    if (!isUsageMetricSectionTitle(section.title)) continue;
    const group = usageSectionGroup(provider, section.title);
    for (const row of section.rows) {
      if (!row.value?.trim()) continue;
      if (row.label.toLowerCase() === "billing period") continue;
      const index = rows.length;
      const extractedPercent = extractPercent(row.value);
      const factoryWindowGroup =
        group === FACTORY_USAGE_MODE_STANDARD ||
        group === FACTORY_USAGE_MODE_DROID_CORE ||
        group === FACTORY_MANAGED_COMPUTERS_GROUP;
      rows.push({
        group,
        label: row.label,
        value: row.value,
        percent:
          extractedPercent ??
          (factoryWindowGroup ? 0 : index === 0 ? (provider.usage_summary?.percent ?? null) : null),
        amountText: index === 0 ? amountText : null,
        detailText: extractMetricDetail(row.value),
        resetText: extractResetText(row.value),
        segments: [],
      });
    }
  }
  return foldSharedPoolSegments(provider.id, rows);
}

/** Prepaid/credits balance. Ignores usage percents mistakenly stored as credits_label. */
export function providerCreditsLabel(provider: QuotaProviderResponse): string | null {
  const balance = firstRowValue(provider, "Credits", "Balance");
  const summary = provider.subscription_summary?.credits_label?.trim() || null;
  const raw = balance ?? summary;
  if (!raw) return null;
  if (/%\s*used/i.test(raw)) return null;
  return raw;
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
