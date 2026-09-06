import { describe, expect, test } from "bun:test";
import type { QuotaProviderResponse } from "@/api/ws-api";
import {
  presentQuotaMetric,
  quotaMetrics,
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
    });
  });
});
