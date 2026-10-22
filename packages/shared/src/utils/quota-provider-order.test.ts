import { describe, expect, test } from "bun:test";

import { sortQuotaProvidersForSwitchList, type QuotaSwitchListItem } from "./quota-provider-order";

function item(id: string, label: string, switchEnabled: boolean): QuotaSwitchListItem {
  return { id, label, switch_enabled: switchEnabled };
}

describe("sortQuotaProvidersForSwitchList", () => {
  test("orders switch, then saved order, then label", () => {
    const providers = [
      item("zed", "Zed", true),
      item("grok", "Grok Build", false),
      item("cursor", "Cursor", true),
      item("factory", "Factory", true),
    ];
    expect(
      sortQuotaProvidersForSwitchList(providers, ["factory", "cursor"]).map(
        (provider) => provider.id,
      ),
    ).toEqual(["factory", "cursor", "zed", "grok"]);
  });

  test("does not let a saved index pull a switch-off provider ahead", () => {
    const providers = [
      item("grok", "Grok Build", false),
      item("cursor", "Cursor", true),
      item("factory", "Factory", true),
    ];
    expect(
      sortQuotaProvidersForSwitchList(providers, ["grok", "factory"]).map(
        (provider) => provider.id,
      ),
    ).toEqual(["factory", "cursor", "grok"]);
  });

  test("uses label order when the saved order is empty", () => {
    const providers = [
      item("zed", "Zed", true),
      item("cursor", "Cursor", true),
      item("grok", "Grok Build", false),
    ];
    expect(sortQuotaProvidersForSwitchList(providers).map((provider) => provider.id)).toEqual([
      "cursor",
      "zed",
      "grok",
    ]);
  });

  test("keeps equal keys in their original order", () => {
    const providers = [item("a", "Same", true), item("b", "Same", true)];
    expect(
      sortQuotaProvidersForSwitchList(providers, ["missing"]).map((provider) => provider.id),
    ).toEqual(["a", "b"]);
  });
});
