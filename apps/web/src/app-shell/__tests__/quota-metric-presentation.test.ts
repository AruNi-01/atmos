import { describe, expect, test } from "bun:test";
import type { QuotaProviderResponse } from "@/api/ws-api";
import {
  presentQuotaMetric,
  providerCreditsLabel,
  quotaMetrics,
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
