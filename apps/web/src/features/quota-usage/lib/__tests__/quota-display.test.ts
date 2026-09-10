import { describe, expect, test } from "bun:test";
import type { QuotaProviderResponse } from "@/api/ws-api";
import {
  formatQuotaCarouselText,
  formatQuotaFetchFailureMessage,
} from "@/features/quota-usage/lib/quota-display";
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

describe("Grok quota display", () => {
  test("carousel uses the shared weekly pool and ignores a percent credits_label", () => {
    expect(
      formatQuotaCarouselText(
        provider({
          id: "grok",
          label: "Grok Build",
          kind: "cli",
          subscription_summary: {
            plan_label: "SuperGrok",
            window_label: "Weekly",
            credits_label: "5% used",
            billing_state: "active",
            reset_at: Math.floor(Date.now() / 1000) + 2 * 24 * 3600,
          },
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
          manual_setup: null,
        }),
      ),
    ).toBe("Grok Build: Weekly 6% used, Extra Disabled");
  });
});

describe("Factory quota display", () => {
  test("carousel uses Standard windows and ignores unused Droid Core", () => {
    expect(
      formatQuotaCarouselText(
        provider({
          id: "factory",
          label: "Factory Droid",
          kind: "cli",
          subscription_summary: {
            plan_label: "Factory Pro Annual Plan",
            window_label: null,
            credits_label: "$0.00",
            billing_state: "active",
            reset_at: Math.floor(Date.now() / 1000) + 4 * 3600,
          },
          usage_summary: {
            unit: "percent",
            currency: null,
            used: 5,
            remaining: 95,
            cap: 100,
            percent: 5,
            used_label: "5% used",
            remaining_label: "95% left",
            cap_label: "100%",
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
              title: "Credits",
              rows: [{ label: "Balance", value: "$0.00", tone: "default" }],
            },
          ],
          manual_setup: null,
        }),
      ),
    ).toBe("Factory Droid: 5h 5% used, 1w 2% used, 1m 3% used, $0.00");
  });
});

describe("formatQuotaFetchFailureMessage", () => {
  const issues = [
    { provider_id: "grok", provider_label: "Grok Build", message: "network unreachable" },
    { provider_id: "claude", provider_label: "Claude", message: "timed out" },
  ];

  test("prefers the latest client/network error over provider issues", () => {
    expect(
      formatQuotaFetchFailureMessage(issues, { clientError: "Failed to load usage overview" }),
    ).toBe("Failed to load usage overview");
  });

  test("joins provider issues and can filter to the current agent", () => {
    expect(formatQuotaFetchFailureMessage(issues)).toBe(
      "Grok Build: network unreachable · Claude: timed out",
    );
    expect(formatQuotaFetchFailureMessage(issues, { providerIds: ["grok"] })).toBe(
      "Grok Build: network unreachable",
    );
  });

  test("returns null when there is no fetch failure", () => {
    expect(formatQuotaFetchFailureMessage([])).toBeNull();
    expect(formatQuotaFetchFailureMessage(issues, { providerIds: ["cursor"] })).toBeNull();
  });
});
