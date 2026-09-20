import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { QuotaProviderResponse } from "@/api/ws-api";
import {
  displayResetText,
  FACTORY_USAGE_MODE_DROID_CORE,
  FACTORY_USAGE_MODE_STANDARD,
  factoryManagedComputerMetrics,
  factoryWindowMetrics,
  presentQuotaMetric,
  providerCreditsLabel,
  quotaMetricHeading,
  quotaMetricShowsBar,
  quotaMetrics,
  usagePortalUrl,
  usageSegmentFillClass,
} from "@/app-shell/quota-popover-utils";

function provider(
  partial: Pick<QuotaProviderResponse, "id" | "label" | "detail_sections"> &
    Partial<QuotaProviderResponse>,
): QuotaProviderResponse {
  return {
    kind: "cli",
    enabled: true,
    switch_enabled: true,
    footer_carousel_show: true,
    healthy: true,
    last_updated_at: null,
    subscription_summary: {
      plan_label: "SuperGrok",
      window_label: "Weekly",
      credits_label: null,
      billing_state: "active",
      reset_at: Math.floor(Date.now() / 1000) + 4 * 24 * 3600,
    },
    usage_summary: {
      unit: "percent",
      currency: null,
      used: 0,
      remaining: 100,
      cap: 100,
      percent: 0,
      used_label: "0% used",
      remaining_label: "100% left",
      cap_label: "100%",
    },
    warnings: [],
    auth_state: {
      status: "detected",
      source: "auth.json",
      detail: null,
      setup_hint: null,
    },
    fetch_state: { status: "ready", message: null },
    manual_setup: null,
    ...partial,
  };
}

function present(providerValue: QuotaProviderResponse) {
  return quotaMetrics(providerValue).map((metric) =>
    presentQuotaMetric(metric, {
      fallbackResetAt: providerValue.subscription_summary?.reset_at,
      locale: "en",
    }),
  );
}

describe("presentQuotaMetric", () => {
  test("Grok weekly window keeps percent, bar, and reset; extra usage is amount-only", () => {
    const views = present(
      provider({
        id: "grok",
        label: "Grok Build",
        detail_sections: [
          {
            title: "Usage",
            rows: [
              {
                label: "Weekly",
                value: "0% used · resets in 4d",
                tone: "default",
              },
              { label: "Extra usage", value: "Disabled", tone: "muted" },
            ],
          },
        ],
      }),
    );

    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({
      label: "Weekly",
      valueText: "0%",
      percent: 0,
    });
    expect(views[0]?.resetText).toMatch(/resets in/i);

    expect(views[1]).toEqual({
      group: null,
      label: "Extra usage",
      valueText: "Disabled",
      resetText: null,
      percent: null,
      segments: [],
    });
  });

  test("Grok extra usage with a dollar cap shows the amount and no progress", () => {
    const views = present(
      provider({
        id: "grok",
        label: "Grok Build",
        detail_sections: [
          {
            title: "Usage",
            rows: [
              {
                label: "Weekly",
                value: "13% used · resets in 4d",
                tone: "default",
              },
              {
                label: "Extra usage",
                value: "$1.20 / $25.00",
                tone: "muted",
              },
            ],
          },
        ],
      }),
    );

    expect(views[1]).toEqual({
      group: null,
      label: "Extra usage",
      valueText: "$1.20 / $25.00",
      resetText: null,
      percent: null,
      segments: [],
    });
  });

  test("does not inherit the window percent onto extra usage when it is the first row", () => {
    const views = present(
      provider({
        id: "grok",
        label: "Grok Build",
        usage_summary: {
          unit: "percent",
          currency: null,
          used: 0,
          remaining: 100,
          cap: 100,
          percent: 0,
          used_label: "0% used",
          remaining_label: "100% left",
          cap_label: "100%",
        },
        detail_sections: [
          {
            title: "Usage",
            rows: [{ label: "Extra usage", value: "Disabled", tone: "muted" }],
          },
        ],
      }),
    );

    expect(views).toEqual([
      {
        group: null,
        label: "Extra usage",
        valueText: "Disabled",
        resetText: null,
        percent: null,
        segments: [],
      },
    ]);
  });

  test("Cursor on-demand dollar rows stay amount-only; included usage keeps a window", () => {
    const views = present(
      provider({
        id: "cursor",
        label: "Cursor",
        detail_sections: [
          {
            title: "Usage",
            rows: [
              {
                label: "Included usage",
                value: "42% used · $21 / $50 · resets in 12d",
                tone: "default",
              },
              {
                label: "On-Demand",
                value: "$4.10 / $10.00",
                tone: "default",
              },
            ],
          },
        ],
      }),
    );

    expect(views[0]).toMatchObject({
      label: "Included usage",
      valueText: "42%",
      percent: 42,
    });
    expect(views[0]?.resetText).toMatch(/resets in/i);
    expect(views[1]).toEqual({
      group: null,
      label: "On-Demand",
      valueText: "$4.10 / $10.00",
      resetText: null,
      percent: null,
      segments: [],
    });
  });

  test("Amp bonus text is not treated as a usage bar", () => {
    const views = present(
      provider({
        id: "amp",
        label: "Amp",
        detail_sections: [
          {
            title: "Usage",
            rows: [
              {
                label: "Realtime replenishes",
                value: "18% used · resets in 5h",
                tone: "default",
              },
              { label: "Bonus", value: "+10% for 7d", tone: "default" },
            ],
          },
        ],
      }),
    );

    expect(views[1]).toEqual({
      group: null,
      label: "Bonus",
      valueText: "+10% for 7d",
      resetText: null,
      percent: null,
      segments: [],
    });
  });

  test("Grok product rows fold into one shared-pool bar with segments", () => {
    const views = present(
      provider({
        id: "grok",
        label: "Grok Build",
        usage_summary: {
          unit: "percent",
          currency: null,
          used: 6,
          remaining: 94,
          cap: 100,
          percent: 6,
          used_label: "6% used",
          remaining_label: "94% left",
          cap_label: "100%",
        },
        detail_sections: [
          {
            title: "Usage",
            rows: [
              {
                label: "Weekly",
                value: "6% used · resets in 2d, 11h",
                tone: "default",
              },
              { label: "Grok Build", value: "5% used", tone: "default" },
              { label: "Chat", value: "1% used", tone: "default" },
              { label: "Extra usage", value: "Disabled", tone: "muted" },
            ],
          },
        ],
      }),
    );

    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({
      label: "Weekly",
      valueText: "6%",
      percent: 6,
      segments: [
        { label: "Grok Build", percent: 5 },
        { label: "Chat", percent: 1 },
      ],
    });
    expect(views[1]).toMatchObject({
      label: "Extra usage",
      valueText: "Disabled",
      percent: null,
    });
  });

  test("does not treat a usage percent as prepaid credits", () => {
    const grok = provider({
      id: "grok",
      label: "Grok Build",
      subscription_summary: {
        plan_label: "SuperGrok",
        window_label: "Weekly",
        credits_label: "5% used",
        billing_state: "active",
        reset_at: Math.floor(Date.now() / 1000) + 4 * 24 * 3600,
      },
      detail_sections: [
        {
          title: "Usage",
          rows: [{ label: "Weekly", value: "5% used · resets in 2d", tone: "default" }],
        },
      ],
    });

    expect(providerCreditsLabel(grok)).toBeNull();
  });

  test("Factory Standard and Droid Core stay separate and keep their own resets", () => {
    const fiveHourReset = Math.floor(Date.now() / 1000) + 4 * 3600 + 25 * 60;
    const views = present(
      provider({
        id: "factory",
        label: "Factory Droid",
        subscription_summary: {
          plan_label: "Factory Pro Annual Plan",
          window_label: null,
          credits_label: "$0.00",
          billing_state: "active",
          reset_at: fiveHourReset,
        },
        detail_sections: [
          {
            title: "Standard",
            rows: [
              { label: "5 hours", value: "5% used · Resets in 4h 25m", tone: "default" },
              { label: "1 week", value: "2% used · Resets in 6d 0h", tone: "default" },
              { label: "1 month", value: "3% used · Resets in 14d 23h", tone: "default" },
            ],
          },
          {
            title: "Droid Core",
            rows: [
              { label: "5 hours", value: "0% used · Use Droid to start", tone: "default" },
              { label: "1 week", value: "0% used · Use Droid to start", tone: "default" },
              { label: "1 month", value: "0% used · Use Droid to start", tone: "default" },
            ],
          },
          {
            title: "Managed Computers",
            rows: [
              {
                label: "Managed Computers",
                value: "0% used · 0m / 5.0h · Resets in 138d 0h",
                tone: "default",
              },
            ],
          },
        ],
      }),
    );

    expect(views).toHaveLength(7);
    expect(views[0]).toMatchObject({
      group: "Standard",
      label: "5 hours",
      valueText: "5%",
      percent: 5,
    });
    expect(views[0]?.resetText).toMatch(/4h/i);
    expect(views[0]?.resetText).not.toMatch(/6d/i);

    expect(views[1]).toMatchObject({
      group: "Standard",
      label: "1 week",
      valueText: "2%",
      percent: 2,
    });
    expect(views[1]?.resetText).toMatch(/6d/i);
    expect(views[1]?.resetText).not.toMatch(/4h/i);

    expect(views[2]?.resetText).toMatch(/14d/i);

    expect(views[3]).toMatchObject({
      group: "Droid Core",
      label: "5 hours",
      valueText: "0%",
      percent: 0,
      resetText: "Use Droid to start",
    });
    expect(views[6]).toMatchObject({
      group: "Managed Computers",
      label: "Managed Computers",
      valueText: "0%",
      percent: 0,
    });
    const metrics = quotaMetrics(
      provider({
        id: "factory",
        label: "Factory Droid",
        detail_sections: [
          {
            title: "Standard",
            rows: [{ label: "5 hours", value: "5% used · Resets in 4h 25m", tone: "default" }],
          },
          {
            title: "Droid Core",
            rows: [{ label: "5 hours", value: "0% used · Use Droid to start", tone: "default" }],
          },
          {
            title: "Managed Computers",
            rows: [{ label: "Managed Computers", value: "0% used · 0m / 5.0h · Resets in 138d 0h", tone: "default" }],
          },
        ],
      }),
    );
    expect(factoryWindowMetrics(metrics, FACTORY_USAGE_MODE_STANDARD)).toHaveLength(1);
    expect(factoryWindowMetrics(metrics, FACTORY_USAGE_MODE_DROID_CORE)[0]?.label).toBe("5 hours");
    expect(factoryManagedComputerMetrics(metrics)).toHaveLength(1);
    expect(factoryManagedComputerMetrics(metrics)[0]?.detailText).toBe("0m / 5.0h");
    expect(quotaMetricHeading("5 hours", "9% used")).toBe("5 hours · 9% used");
    expect(quotaMetricShowsBar(0)).toBe(true);
    expect(quotaMetricShowsBar(views[3]?.percent)).toBe(true);
    expect(quotaMetricShowsBar(views[6]?.percent)).toBe(true);
    expect(quotaMetricShowsBar(null)).toBe(false);
  });
});

describe("displayResetText", () => {
  test("does not replace a window's own countdown with the subscription reset", () => {
    const fiveHourReset = Math.floor(Date.now() / 1000) + 4 * 3600;
    expect(
      displayResetText("Resets in 6d 0h", fiveHourReset, {}, "en"),
    ).toMatch(/6d/i);
    expect(
      displayResetText("Resets in 6d 0h", fiveHourReset, {}, "en"),
    ).not.toMatch(/4h/i);
    expect(displayResetText("Use Droid to start", fiveHourReset, {}, "en")).toBe(
      "Use Droid to start",
    );
  });
});

describe("quota popover factory chrome", () => {
  test("uses center-style motion tabs and one-line window headings", () => {
    const detail = readFileSync(join(import.meta.dir, "../quota-popover-detail.tsx"), "utf8");
    const components = readFileSync(
      join(import.meta.dir, "../quota-popover-components.tsx"),
      "utf8",
    );
    expect(detail).toContain("QuotaModeTabs");
    expect(detail).toContain("factoryWindowMetrics");
    expect(detail).toContain("factoryManagedComputerMetrics");
    expect(components).toContain('from "@workspace/ui/components/motion/tabs"');
    expect(components).toContain('className="h-8 w-fit gap-0.5 p-0.5"');
    expect(components).not.toContain("indicatorClassName=");
    expect(components).not.toContain("bg-background shadow-sm");
    expect(components).not.toContain("bg-active");
    expect(components).toContain("${label} · ${usedText}");
    expect(components).toContain("quotaMetricShowsBar(percent)");
    expect(components).toContain('role="progressbar"');
    expect(components).toContain('"h-1.5 w-full shrink-0 overflow-hidden rounded-full bg-muted"');
    expect(components).toContain("scaleX");
    expect(components).toContain("origin-left");
  });

  test("factory mode tabs sit above usage rows, not above the provider header", () => {
    const detail = readFileSync(join(import.meta.dir, "../quota-popover-detail.tsx"), "utf8");
    const providerDetail = detail.slice(detail.indexOf("export function ProviderDetail"));
    const headerLabel = providerDetail.indexOf(
      'className="text-sm font-semibold tracking-tight text-foreground">{provider.label}',
    );
    const tabs = providerDetail.indexOf("<QuotaUsageModeTabs");
    const firstMetric = providerDetail.indexOf("{visibleMetrics.map");
    expect(headerLabel).toBeGreaterThan(-1);
    expect(tabs).toBeGreaterThan(headerLabel);
    expect(firstMetric).toBeGreaterThan(tabs);

    const detectedDetails = detail.slice(detail.indexOf("function DetectedProviderDetails"));
    const detectedHeader = detectedDetails.indexOf(
      'className="truncate text-xs text-foreground">{accountLabel}',
    );
    const detectedTabs = detectedDetails.indexOf("<QuotaUsageModeTabs");
    const detectedMetrics = detectedDetails.indexOf("{visibleMetrics.length > 0");
    expect(detectedHeader).toBeGreaterThan(-1);
    expect(detectedTabs).toBeGreaterThan(detectedHeader);
    expect(detectedMetrics).toBeGreaterThan(detectedTabs);
  });
});

describe("usagePortalUrl", () => {
  test("links Factory Droid to the usage settings page", () => {
    expect(usagePortalUrl("factory", null)).toBe("https://app.factory.ai/settings/usage");
  });
});

describe("usageSegmentFillClass", () => {
  test("gives each Grok product a distinct color that legend dots can share", () => {
    expect(usageSegmentFillClass("Grok Build", 0)).toBe("bg-info");
    expect(usageSegmentFillClass("Chat", 1)).toBe("bg-success");
    expect(usageSegmentFillClass("Image", 2)).toBe("bg-warning");
    expect(usageSegmentFillClass("Voice", 3)).toBe("bg-chart-2");
    expect(usageSegmentFillClass("Grok Build", 0)).not.toBe(
      usageSegmentFillClass("Chat", 1),
    );
  });
});
