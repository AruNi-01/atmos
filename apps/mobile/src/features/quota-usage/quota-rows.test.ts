// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { QuotaProviderResponse } from "@atmos/api-types/ws/dto/quota";
import { creditsLabel, extraSections, usageRows } from "./quota-rows";

function provider(partial: Partial<QuotaProviderResponse>): QuotaProviderResponse {
  return {
    id: "cursor",
    label: "Cursor",
    kind: "desktop",
    enabled: true,
    switch_enabled: true,
    footer_carousel_show: true,
    healthy: true,
    last_updated_at: null,
    subscription_summary: null,
    usage_summary: null,
    detail_sections: [],
    warnings: [],
    auth_state: { status: "detected", source: null, detail: null, setup_hint: null },
    fetch_state: { status: "ready", message: null },
    manual_setup: null,
    ...partial,
  };
}

describe("quota usage rows", () => {
  test("keeps Cursor dollar amounts, reset times, and the Team section", () => {
    const rows = usageRows(provider({
      detail_sections: [
        {
          title: "Usage",
          rows: [
            { label: "Cursor Models", value: "100% used · Resets in 4d, 17h", tone: "default" },
            { label: "Other Models", value: "100% used · $20.00 / $20.00 · Resets in 4d, 17h", tone: "default" },
            { label: "On-Demand", value: "100% used · $2,000.09 / $2,000.00 · Resets in 4d, 17h", tone: "default" },
          ],
        },
        {
          title: "Team",
          rows: [{ label: "On-Demand", value: "42% used · $200,873.07 / $480,000.00", tone: "default" }],
        },
      ],
    }));
    expect(rows.map((row) => [row.label, row.usedText, row.detailText, row.resetText])).toEqual([
      ["Cursor Models", "100% used", null, "Resets in 4d, 17h"],
      ["Other Models", "100% used", "$20.00 / $20.00", "Resets in 4d, 17h"],
      ["On-Demand", "100% used", "$2,000.09 / $2,000.00", "Resets in 4d, 17h"],
    ]);
    expect(extraSections(provider({
      detail_sections: [
        {
          title: "Team",
          rows: [{ label: "On-Demand", value: "42% used · $200,873.07 / $480,000.00", tone: "default" }],
        },
      ],
    }))[0]?.rows[0]?.value).toBe("42% used · $200,873.07 / $480,000.00");
  });

  test("folds Grok product rows into the weekly pool and keeps extra usage", () => {
    const rows = usageRows(provider({
      id: "grok",
      label: "Grok Build",
      detail_sections: [{
        title: "Usage",
        rows: [
          { label: "Weekly", value: "6% used · resets in 2d, 11h", tone: "default" },
          { label: "Grok Build", value: "5% used", tone: "default" },
          { label: "Chat", value: "1% used", tone: "default" },
          { label: "Extra usage", value: "Disabled", tone: "muted" },
        ],
      }],
    }));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.segments.map((segment) => segment.label)).toEqual(["Grok Build", "Chat"]);
    expect(rows[1]?.usedText).toBe("Disabled");
  });

  test("keeps Factory Standard and Droid Core windows, and DeepSeek balance", () => {
    const factory = usageRows(provider({
      id: "factory",
      detail_sections: [
        { title: "Standard", rows: [{ label: "5 hours", value: "5% used · Resets in 4h 25m", tone: "default" }] },
        { title: "Droid Core", rows: [{ label: "5 hours", value: "0% used · Use Droid to start", tone: "default" }] },
      ],
    }));
    expect(factory.map((row) => row.group)).toEqual(["Standard", "Droid Core"]);
    const deepseek = extraSections(provider({
      id: "deepseek",
      subscription_summary: {
        plan_label: null,
        window_label: null,
        credits_label: "110.00 CNY · 20 USD",
        billing_state: "active",
        reset_at: null,
      },
      detail_sections: [{
        title: "Balance",
        rows: [
          { label: "Total (CNY)", value: "110.00 CNY", tone: "default" },
          { label: "Topped up (CNY)", value: "100.00 CNY", tone: "default" },
        ],
      }],
    }));
    expect(deepseek[0]?.rows.map((row) => row.label)).toEqual(["Total (CNY)", "Topped up (CNY)"]);
    expect(creditsLabel(provider({
      id: "deepseek",
      subscription_summary: {
        plan_label: null,
        window_label: null,
        credits_label: "110.00 CNY · 20 USD",
        billing_state: null,
        reset_at: null,
      },
    }))).toBe("110.00 CNY · 20 USD");
  });
});
