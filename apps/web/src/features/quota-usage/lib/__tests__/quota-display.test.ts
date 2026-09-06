import { describe, expect, test } from "bun:test";
import type { QuotaProviderResponse } from "@/api/ws-api";
import { formatQuotaCarouselText } from "@/features/quota-usage/lib/quota-display";
import { extraSections } from "@/app-shell/quota-popover-utils";

function provider(partial: Partial<QuotaProviderResponse>): QuotaProviderResponse {
  return {
    id: "deepseek",
    label: "DeepSeek",
    kind: "api",
    enabled: true,
    switch_enabled: true,
    footer_carousel_show: true,
    healthy: true,
    last_updated_at: null,
    subscription_summary: {
      plan_label: null,
      window_label: null,
      credits_label: "110.00 CNY · 20 USD",
      billing_state: "active",
      reset_at: null,
    },
    usage_summary: {
      unit: "balance",
      currency: "CNY",
      used: null,
      remaining: 110,
      cap: null,
      percent: null,
      used_label: null,
      remaining_label: "110.00 CNY",
      cap_label: null,
    },
    detail_sections: [
      {
        title: "Account",
        rows: [{ label: "Account", value: "DeepSeek", tone: "default" }],
      },
      {
        title: "Balance",
        rows: [
          { label: "Available", value: "Yes", tone: "success" },
          { label: "Total (CNY)", value: "110.00 CNY", tone: "default" },
          { label: "Granted (CNY)", value: "10.00 CNY", tone: "default" },
          { label: "Topped up (CNY)", value: "100.00 CNY", tone: "default" },
        ],
      },
    ],
    warnings: [],
    auth_state: {
      status: "detected",
      source: null,
      detail: null,
      setup_hint: null,
    },
    fetch_state: { status: "ready", message: null },
    manual_setup: {
      selected_region: null,
      region_options: [],
      api_key_configured: true,
      configured_keys: [{ id: "abcd", region: null }],
    },
    ...partial,
  };
}

describe("DeepSeek quota display", () => {
  test("carousel shows prepaid balances instead of usage percent", () => {
    expect(formatQuotaCarouselText(provider({}))).toBe(
      "DeepSeek: 110.00 CNY · 20 USD",
    );
  });

  test("keeps per-currency balance rows as extra detail", () => {
    const sections = extraSections(provider({}));
    expect(sections.map((section) => section.title)).toEqual(["Balance"]);
    expect(sections[0]?.rows.map((row) => row.label)).toEqual([
      "Available",
      "Total (CNY)",
      "Granted (CNY)",
      "Topped up (CNY)",
    ]);
  });
});
