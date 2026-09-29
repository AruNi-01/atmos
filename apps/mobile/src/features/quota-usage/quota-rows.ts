import type { QuotaProviderResponse } from "@atmos/api-types/ws/dto/quota";

export type UsageSegment = { label: string; percent: number };

export type UsageRow = {
  key: string;
  group: string | null;
  label: string;
  usedText: string;
  detailText: string | null;
  resetText: string | null;
  percent: number | null;
  segments: UsageSegment[];
};

export type ExtraRow = {
  key: string;
  label: string;
  value: string;
  percent: number | null;
  resetText: string | null;
};

export type ExtraSection = {
  title: string;
  headerValue: string | null;
  rows: ExtraRow[];
};

const USAGE_TITLES = new Set(["usage", "standard", "droid core", "core", "managed computers"]);
const HIDDEN_EXTRA = new Set([
  "account",
  "usage",
  "standard",
  "droid core",
  "core",
  "managed computers",
  "credits",
  "fetch pipeline",
]);

function extractPercent(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)%\s*used/i);
  return match ? Number(match[1]) : null;
}

function partsOf(text: string): string[] {
  return text.split("·").map((part) => part.trim()).filter(Boolean);
}

function isResetPart(part: string): boolean {
  return /^reset/i.test(part) || /^use droid to start$/i.test(part);
}

function extractResetText(text: string): string | null {
  return partsOf(text).findLast(isResetPart) ?? null;
}

function extractDetail(text: string): string | null {
  const details = partsOf(text).slice(1).filter((part) => !isResetPart(part));
  return details[0] ?? null;
}

function firstRow(provider: QuotaProviderResponse, sectionTitle: string, rowLabel: string): string | null {
  const section = provider.detail_sections.find((item) => item.title.toLowerCase() === sectionTitle.toLowerCase());
  return section?.rows.find((row) => row.label.toLowerCase() === rowLabel.toLowerCase())?.value ?? null;
}

function groupFor(provider: QuotaProviderResponse, title: string): string | null {
  const normalized = title.trim().toLowerCase();
  if (normalized === "standard") return "Standard";
  if (normalized === "droid core" || normalized === "core") return "Droid Core";
  if (normalized === "managed computers") return "Managed Computers";
  if (normalized === "usage") {
    const hasCore = provider.detail_sections.some((section) => {
      const sectionTitle = section.title.trim().toLowerCase();
      return sectionTitle === "droid core" || sectionTitle === "core";
    });
    return hasCore ? "Standard" : null;
  }
  return null;
}

function foldGrokSegments(providerId: string, rows: UsageRow[]): UsageRow[] {
  if (providerId !== "grok") return rows;
  const folded: UsageRow[] = [];
  for (const row of rows) {
    const last = folded.at(-1);
    if (
      last &&
      last.percent != null &&
      row.percent != null &&
      !row.resetText &&
      !/extra usage|prepaid|on-?demand/i.test(row.label)
    ) {
      last.segments.push({ label: row.label, percent: row.percent });
      continue;
    }
    folded.push({ ...row, segments: [...row.segments] });
  }
  return folded;
}

export function usageRows(provider: QuotaProviderResponse): UsageRow[] {
  const rows: UsageRow[] = [];
  for (const section of provider.detail_sections) {
    if (!USAGE_TITLES.has(section.title.trim().toLowerCase())) continue;
    const group = groupFor(provider, section.title);
    for (const row of section.rows) {
      if (!row.value?.trim() || row.label.toLowerCase() === "billing period") continue;
      const percent = extractPercent(row.value);
      rows.push({
        key: `${group ?? "usage"}:${row.label}`,
        group,
        label: row.label,
        usedText: percent == null ? row.value : `${Math.round(percent)}% used`,
        detailText: extractDetail(row.value),
        resetText: extractResetText(row.value),
        percent,
        segments: [],
      });
    }
  }
  return foldGrokSegments(provider.id, rows);
}

export function extraSections(provider: QuotaProviderResponse): ExtraSection[] {
  return provider.detail_sections
    .filter((section) => !HIDDEN_EXTRA.has(section.title.trim().toLowerCase()))
    .map((section) => {
      const total = provider.id === "zai" && section.title.toLowerCase() === "mcp details"
        ? section.rows.find((row) => row.label.toLowerCase() === "total")?.value ?? null
        : null;
      const rows = section.rows
        .filter((row) => row.value?.trim() && !(provider.id === "zai" && row.label.toLowerCase() === "total"))
        .map((row) => {
          const resetText = extractResetText(row.value);
          const value = resetText ? row.value.replace(/\s*·\s*resets in[^·]*/i, "").trim() : row.value;
          return {
            key: `${section.title}:${row.label}`,
            label: row.label,
            value,
            percent: extractPercent(row.value),
            resetText,
          };
        });
      return { title: section.title, headerValue: total, rows };
    })
    .filter((section) => section.rows.length > 0 || section.headerValue);
}

export function providerHeading(provider: QuotaProviderResponse): { account: string | null; plan: string | null } {
  const account = firstRow(provider, "Account", "Account");
  const plan = firstRow(provider, "Account", "Plan") ?? provider.subscription_summary?.plan_label ?? null;
  const generic = !account || account.trim().toLowerCase() === provider.label.trim().toLowerCase();
  const usablePlan = plan && plan !== "No plan data" ? plan : null;
  return {
    account: generic ? null : account,
    plan: usablePlan,
  };
}

export function creditsLabel(provider: QuotaProviderResponse): string | null {
  const balance = firstRow(provider, "Credits", "Balance");
  const summary = provider.subscription_summary?.credits_label?.trim() || null;
  const raw = balance ?? summary;
  if (!raw || /%\s*used/i.test(raw)) return null;
  return raw;
}
