import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SETTINGS_SEARCH_ITEMS } from "@/features/settings/components/settings-modal-data";
import enMessages from "../../../../../messages/en.json";
import zhMessages from "../../../../../messages/zh.json";

const root = join(import.meta.dir, "../../../../../../..");

function nestedRecord(value: unknown, path: string): Record<string, unknown> | undefined {
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current && typeof current === "object" && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : undefined;
}

function leafAt(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

describe("settings.modal.search i18n", () => {
  it("keeps en/zh search item labels aligned without missing description keys", () => {
    const enItems = nestedRecord(enMessages, "settings.modal.search.items");
    const zhItems = nestedRecord(zhMessages, "settings.modal.search.items");
    expect(enItems).toBeDefined();
    expect(zhItems).toBeDefined();

    expect(SETTINGS_SEARCH_ITEMS.length).toBeGreaterThan(100);

    const missingLabels: string[] = [];
    const missingZhLabels: string[] = [];
    const missingDescriptions: string[] = [];
    const missingZhDescriptions: string[] = [];

    for (const item of SETTINGS_SEARCH_ITEMS) {
      const labelPath = `settings.modal.search.items.${item.translationKey}.label`;
      const descriptionPath = `settings.modal.search.items.${item.translationKey}.description`;
      const enLabel = leafAt(enMessages, labelPath);
      const zhLabel = leafAt(zhMessages, labelPath);
      if (typeof enLabel !== "string" || enLabel.length === 0) missingLabels.push(labelPath);
      if (typeof zhLabel !== "string" || zhLabel.length === 0) missingZhLabels.push(labelPath);

      const enDescription = leafAt(enMessages, descriptionPath);
      const zhDescription = leafAt(zhMessages, descriptionPath);
      if (enDescription !== undefined && typeof enDescription !== "string") {
        missingDescriptions.push(descriptionPath);
      }
      if (zhDescription !== undefined && typeof zhDescription !== "string") {
        missingZhDescriptions.push(descriptionPath);
      }
      if (typeof enDescription === "string" && typeof zhDescription !== "string") {
        missingZhDescriptions.push(descriptionPath);
      }
    }

    expect(missingLabels).toEqual([]);
    expect(missingZhLabels).toEqual([]);
    expect(missingDescriptions).toEqual([]);
    expect(missingZhDescriptions).toEqual([]);
  });

  it("does not look up search item descriptions unless the message exists", () => {
    const sidebar = readFileSync(
      join(root, "apps/web/src/features/settings/components/settings-modal-sidebar.tsx"),
      "utf8",
    );
    expect(sidebar).toContain("t.has(itemDescriptionKey)");
    expect(sidebar).not.toContain("entry.translationKey && entry.description");
  });
});
