import { describe, expect, test } from "bun:test";

import {
  partitionQuotaProviderIdsBySwitch,
  reorderQuotaProvidersKeepingEnabledFirst,
  sortQuotaProvidersBySwitchAndOrder,
} from "@/app-shell/quota-popover-utils";

function provider(
  id: string,
  switchEnabled: boolean,
  label = id,
) {
  return { id, label, switch_enabled: switchEnabled };
}

describe("sortQuotaProvidersBySwitchAndOrder", () => {
  test("keeps switch-enabled providers in front of disabled ones", () => {
    const sorted = sortQuotaProvidersBySwitchAndOrder(
      [
        provider("claude", false),
        provider("codex", true),
        provider("gemini", false),
        provider("grok", true),
      ],
      ["claude", "codex", "gemini", "grok"],
    );

    expect(sorted.map((item) => item.id)).toEqual(["codex", "grok", "claude", "gemini"]);
  });

  test("preserves saved order within the enabled and disabled groups", () => {
    const sorted = sortQuotaProvidersBySwitchAndOrder(
      [
        provider("claude", true),
        provider("codex", true),
        provider("gemini", false),
        provider("grok", false),
      ],
      ["codex", "claude", "grok", "gemini"],
    );

    expect(sorted.map((item) => item.id)).toEqual(["codex", "claude", "grok", "gemini"]);
  });
});

describe("reorderQuotaProvidersKeepingEnabledFirst", () => {
  test("snaps an enabled provider dropped after disabled ones to the end of enabled", () => {
    const visualIds = ["codex", "grok", "claude", "gemini"];
    const next = reorderQuotaProvidersKeepingEnabledFirst(
      visualIds,
      "codex",
      "gemini",
      ["codex", "grok"],
    );

    expect(next).toEqual(["grok", "codex", "claude", "gemini"]);
  });

  test("lets the user reorder enabled providers among themselves", () => {
    const next = reorderQuotaProvidersKeepingEnabledFirst(
      ["codex", "grok", "claude"],
      "codex",
      "grok",
      ["codex", "grok"],
    );

    expect(next).toEqual(["grok", "codex", "claude"]);
  });

  test("snaps a disabled provider dropped into the enabled group to the start of disabled", () => {
    const next = reorderQuotaProvidersKeepingEnabledFirst(
      ["codex", "grok", "claude", "gemini"],
      "gemini",
      "codex",
      ["codex", "grok"],
    );

    expect(next).toEqual(["codex", "grok", "gemini", "claude"]);
  });

  test("lets the user reorder disabled providers among themselves", () => {
    const next = reorderQuotaProvidersKeepingEnabledFirst(
      ["codex", "claude", "gemini"],
      "gemini",
      "claude",
      ["codex"],
    );

    expect(next).toEqual(["codex", "gemini", "claude"]);
  });
});

describe("partitionQuotaProviderIdsBySwitch", () => {
  test("does not change relative order when already partitioned", () => {
    expect(
      partitionQuotaProviderIdsBySwitch(
        ["codex", "grok", "claude"],
        ["codex", "grok"],
      ),
    ).toEqual(["codex", "grok", "claude"]);
  });
});
