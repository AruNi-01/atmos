import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sortQuotaProvidersForSwitchList } from "@atmos/shared";
import type { QuotaProviderResponse } from "@/api/ws-api";
import {
  extraSections,
  providerIdentity,
  providerIdentityRows,
} from "@/app-shell/quota-popover-utils";

function provider(partial: Partial<QuotaProviderResponse>): QuotaProviderResponse {
  return {
    id: "grok",
    label: "Grok Build",
    kind: "cli",
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

describe("quota billing period", () => {
  test("formats a Billing period section and hides it from extra sections", () => {
    const grok = provider({
      detail_sections: [
        {
          title: "Account",
          rows: [{ label: "Account", value: "user@example.com", tone: "default" }],
        },
        {
          title: "Billing period",
          rows: [
            { label: "Start", value: "2026-09-04T22:17:47.739583+00:00", tone: "muted" },
            { label: "End", value: "2026-09-11T22:17:47.739583+00:00", tone: "muted" },
          ],
        },
      ],
    });
    expect(providerIdentity(grok).periodLabel).toBe("Sep 4 - Sep 11");
    expect(extraSections(grok).map((section) => section.title)).not.toContain("Billing period");
  });

  test("keeps Since and Until for a one-sided Billing period section", () => {
    expect(
      providerIdentity(
        provider({
          detail_sections: [
            {
              title: "Billing period",
              rows: [{ label: "End", value: "2026-09-11T00:00:00Z", tone: "muted" }],
            },
          ],
        }),
      ).periodLabel,
    ).toBe("Until Sep 11");
    expect(
      providerIdentity(
        provider({
          detail_sections: [
            {
              title: "Billing period",
              rows: [{ label: "Start", value: "2026-09-04T00:00:00Z", tone: "muted" }],
            },
          ],
        }),
      ).periodLabel,
    ).toBe("Since Sep 4");
  });

  test("leaves a Zed date-only billing period unchanged", () => {
    const zed = provider({
      id: "zed",
      label: "Zed",
      detail_sections: [
        {
          title: "Usage",
          rows: [{ label: "Billing period", value: "2026-03-16 → 2026-03-30", tone: "muted" }],
        },
      ],
    });
    expect(providerIdentity(zed).periodLabel).toBe("2026-03-16 → 2026-03-30");
  });

  test("shows the period under the account for every provider", () => {
    const detail = readFileSync(join(import.meta.dir, "../quota-popover-detail.tsx"), "utf8");
    expect(detail).not.toContain('provider.id === "zed"');

    const periodRow = (label: string, value: string) => ({
      label,
      value,
      tone: "default" as const,
    });
    const cases = [
      {
        id: "zed",
        label: "Zed",
        account: "zed@example.com",
        plan: "Pro",
        period: "2026-03-16 → 2026-03-30",
        detail_sections: [
          {
            title: "Account",
            rows: [periodRow("Account", "zed@example.com"), periodRow("Plan", "Pro")],
          },
          {
            title: "Usage",
            rows: [periodRow("Billing period", "2026-03-16 → 2026-03-30")],
          },
        ],
      },
      {
        id: "cursor",
        label: "Cursor",
        account: "dev@example.com",
        plan: "Pro",
        period: "Sep 4 - Sep 11",
        detail_sections: [
          {
            title: "Account",
            rows: [
              periodRow("Account", "dev@example.com"),
              periodRow("Plan", "Pro"),
              periodRow("Period", "Sep 4 - Sep 11"),
            ],
          },
        ],
      },
      {
        id: "grok",
        label: "Grok Build",
        account: "user@example.com",
        plan: "Super",
        period: "Sep 4 - Sep 11",
        detail_sections: [
          {
            title: "Account",
            rows: [periodRow("Account", "user@example.com"), periodRow("Plan", "Super")],
          },
          {
            title: "Billing period",
            rows: [
              periodRow("Start", "2026-09-04T22:17:47.739583+00:00"),
              periodRow("End", "2026-09-11T22:17:47.739583+00:00"),
            ],
          },
        ],
      },
      {
        id: "factory",
        label: "Factory",
        account: "factory@example.com",
        plan: "Factory Pro",
        period: "Sep 4 - Sep 11",
        detail_sections: [
          {
            title: "Account",
            rows: [
              periodRow("Account", "factory@example.com"),
              periodRow("Plan", "Factory Pro"),
              periodRow("Period", "Sep 4 - Sep 11"),
            ],
          },
        ],
      },
    ];

    for (const item of cases) {
      expect(
        providerIdentityRows(
          provider({
            id: item.id,
            label: item.label,
            detail_sections: item.detail_sections,
          }),
        ),
      ).toEqual([item.account, item.plan, item.period]);
    }
  });

  test("sorts switch-on providers, then saved order, then label", () => {
    const sorted = sortQuotaProvidersForSwitchList(
      [
        { id: "zed", label: "Zed", switch_enabled: false },
        { id: "cursor", label: "Cursor", switch_enabled: true },
        { id: "factory", label: "Factory", switch_enabled: true },
        { id: "grok", label: "Grok", switch_enabled: true },
      ],
      ["zed", "grok", "factory"],
    );
    expect(sorted.map((item) => item.id)).toEqual(["grok", "factory", "cursor", "zed"]);
  });
});
