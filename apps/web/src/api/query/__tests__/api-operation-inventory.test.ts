/**
 * APP-035 · M10 inventory validation (S17)
 *
 * Ensures the typed operation inventory is internally consistent:
 *  - No duplicate (domain, operation) pairs.
 *  - Every entry has required classification / phase / status / legacyOwner.
 *  - Every "query" entry has a queryKeyRoot.
 *  - Every "event" classification entry has an invalidatedBy array (or queryKeyRoot for setQueryData events).
 *  - Every "deferred" / "excluded" entry carries a rationale.
 */

import { describe, expect, test } from "bun:test";
import { apiOperationInventory, type ApiMigrationEntry } from "../api-operation-inventory";

const inventory = apiOperationInventory as unknown as readonly ApiMigrationEntry[];

describe("api-operation-inventory", () => {
  test("no duplicate (domain, operation) pairs", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const entry of inventory) {
      const key = `${entry.domain}::${entry.operation}`;
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }

    expect(duplicates).toEqual([]);
  });

  test("every entry has required scalar fields", () => {
    const missing: string[] = [];

    for (const entry of inventory) {
      const key = `${entry.domain}::${entry.operation}`;
      const required: (keyof ApiMigrationEntry)[] = [
        "domain",
        "operation",
        "transport",
        "classification",
        "legacyOwner",
        "phase",
        "status",
      ];
      for (const field of required) {
        if (!entry[field]) {
          missing.push(`${key} missing ${field}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  test("query entries have a queryKeyRoot", () => {
    const violations: string[] = [];

    for (const entry of inventory) {
      if (entry.classification === "query" && !entry.queryKeyRoot) {
        violations.push(`${entry.domain}::${entry.operation} — query without queryKeyRoot`);
      }
    }

    expect(violations).toEqual([]);
  });

  test("event entries have invalidatedBy or queryKeyRoot (setQueryData policy)", () => {
    const violations: string[] = [];

    for (const entry of inventory) {
      if (entry.classification === "event") {
        const hasInvalidatedBy =
          Array.isArray(entry.invalidatedBy) && entry.invalidatedBy.length > 0;
        const hasKeyRoot = Boolean(entry.queryKeyRoot);
        if (!hasInvalidatedBy && !hasKeyRoot) {
          violations.push(
            `${entry.domain}::${entry.operation} — event without invalidatedBy or queryKeyRoot`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test("deferred and excluded entries have a rationale", () => {
    const violations: string[] = [];

    for (const entry of inventory) {
      if (
        (entry.classification === "deferred" || entry.classification === "excluded" ||
         entry.status === "deferred" || entry.status === "excluded") &&
        !entry.rationale
      ) {
        violations.push(`${entry.domain}::${entry.operation} — deferred/excluded without rationale`);
      }
    }

    expect(violations).toEqual([]);
  });

  test("stream entries without Query wrappers are not classified as query", () => {
    const violations: string[] = [];

    for (const entry of inventory) {
      if (entry.transport === "dedicated-stream" && entry.classification === "query") {
        violations.push(
          `${entry.domain}::${entry.operation} — dedicated-stream classified as query (must be stream or excluded)`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  test("phase and status are consistent for complete entries", () => {
    // A complete entry should not be in phase "deferred" or "excluded"
    const violations: string[] = [];

    for (const entry of inventory) {
      if (
        entry.status === "complete" &&
        (entry.phase === "deferred" || entry.phase === "excluded")
      ) {
        violations.push(
          `${entry.domain}::${entry.operation} — status=complete but phase=${entry.phase}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  test("inventory covers at least all required domains", () => {
    const domains = new Set(inventory.map((e) => e.domain));
    const required = [
      "system",
      "settings",
      "quota",
      "project",
      "git",
      "tokenUsage",
      "skills",
      "automations",
      "github",
      "review",
      "localServices",
      "localModels",
      "resourceMonitor",
      "agentRegistry",
      // deferred
      "acpSessions",
      "canvas",
      "agentHooks",
      "terminalLayout",
      // excluded
      "connection",
      "terminal",
      "agentChat",
      "editor",
    ];

    const missing = required.filter((d) => !domains.has(d));
    expect(missing).toEqual([]);
  });
});
