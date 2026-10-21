import { describe, expect, test } from "bun:test";

import { sortQuotaProvidersForSwitchList, type QuotaSwitchListItem } from "./quota-provider-order";

function item(
  id: string,
  label: string,
  enabled: boolean,
  switchEnabled: boolean,
): QuotaSwitchListItem {
  return { id, label, enabled, switch_enabled: switchEnabled };
}

describe("sortQuotaProvidersForSwitchList", () => {
  test("orders detected, then switch, then saved order, then label", () => {
    const providers = [
      item("zed", "Zed", false, true),
      item("grok", "Grok Build", true, false),
      item("cursor", "Cursor", true, true),
      item("factory", "Factory", true, true),
    ];
    expect(
      sortQuotaProvidersForSwitchList(providers, ["factory", "cursor"]).map(
        (provider) => provider.id,
      ),
    ).toEqual(["factory", "cursor", "grok", "zed"]);
  });

  test("uses label order when the saved order is empty", () => {
    const providers = [
      item("zed", "Zed", true, true),
      item("cursor", "Cursor", true, true),
      item("grok", "Grok Build", true, false),
    ];
    expect(sortQuotaProvidersForSwitchList(providers).map((provider) => provider.id)).toEqual([
      "cursor",
      "zed",
      "grok",
    ]);
  });

  test("keeps equal keys in their original order", () => {
    const providers = [item("a", "Same", true, true), item("b", "Same", true, true)];
    expect(
      sortQuotaProvidersForSwitchList(providers, ["missing"]).map((provider) => provider.id),
    ).toEqual(["a", "b"]);
  });
});
