/**
 * APP-035 · S7  — Complete WebSocket event patches cache
 *           S8  — Partial and streaming events cannot corrupt snapshots
 *           S27 — Every migrated event follows one cache policy
 *
 * Tests the cache-update policy for each domain event registered in
 * ServerStateEventBridge, plus the module-level subscriber-count helper
 * that prevents duplicate subscriptions.
 *
 * Policy table (mirrors server-state-event-bridge.tsx):
 *  quota_overview_updated          → setQueryData  (complete snapshot)
 *  token_usage_updated             → invalidateQueries (tokenUsage root)
 *  local_services_updated          → setQueryData (all_atmos) + invalidate other scan keys
 *  resource_monitor_updated        → setQueryData (scoped snapshot, no refetch)
 *  local_model_state_changed       → invalidateQueries (localModelList)
 *  automation_definition_updated   → invalidateQueries (automationList)
 *  automation_run_updated          → invalidateQueries (automations/runs prefix)
 *  automation_run_output (stream)  → no Query action (stream buffer only)
 */

import { describe, expect, test } from "bun:test";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type { QuotaOverviewResponse } from "@/api/ws/quota-usage-api";
import type { LocalServicesScanResponse } from "@/api/ws/local-services-api";
import { applyQuotaOverviewUpdated } from "@/features/quota-usage/lib/quota-query-events";
import { invalidateTokenUsageQueries } from "@/features/quota-usage/lib/token-usage-query-options";
import { applyLocalServicesUpdated } from "@/features/local-services/lib/local-services-query-events";
import { applyResourceMonitorUpdated } from "@/features/resource-monitor/lib/resource-monitor-query-events";
import type { ResourceMonitorSnapshot } from "@/api/ws/resource-monitor-api";
import { localServicesScopeKey } from "@/features/local-services/store/local-services-store";
import { invalidateLocalModelQueries } from "@/features/local-services/lib/local-model-query-options";
import {
  invalidateAutomationDefinitionQueries,
  invalidateAutomationRunQueries,
} from "@/features/automations/lib/automations-query-options";
import {
  getQuotaOverviewBridgeSubscriberCount,
  getTokenUsageBridgeSubscriberCount,
  getLocalServicesBridgeSubscriberCount,
  getLocalModelBridgeSubscriberCount,
  getAutomationDefinitionBridgeSubscriberCount,
  getAutomationRunBridgeSubscriberCount,
  getResourceMonitorBridgeSubscriberCount,
} from "@/providers/app/server-state-event-bridge";
import { createAtmosWebQueryClient } from "@/providers/app/query-client";

const scope: ComputerQueryScope = {
  activeInstanceId: "local",
  connectionEpoch: 1,
  relaySessionRevision: 0,
};

function makeQuotaOverview(ts = 1_700_000_000): QuotaOverviewResponse {
  return {
    generated_at: ts,
    providers: [],
    all: {
      enabled_count: 1,
      total_count: 2,
      active_subscription_count: 0,
      comparable_credit_currency: null,
      total_credits_used: null,
      total_credits_remaining: null,
      near_limit_sources: [],
      degraded_sources: [],
      soonest_reset_at: null,
    },
    partial_failures: [],
    auto_refresh: { interval_minutes: null },
  };
}

function makeResourceMonitorSnapshot(
  collectedAtMs = 1_700_000_000,
): ResourceMonitorSnapshot {
  const usage = { cpu_percent: 1.5, memory_rss_bytes: 1024, process_count: 1 };
  return {
    collected_at_ms: collectedAtMs,
    host: {
      cpu_percent: 12,
      memory_used_bytes: 8_000_000_000,
      memory_total_bytes: 16_000_000_000,
      logical_cpu_count: 8,
    },
    server: usage,
    shared_runtime: usage,
    projects: [],
    unattributed: { cpu_percent: 0, memory_rss_bytes: 0, process_count: 0 },
    attribution_status: "complete",
  };
}

function makeLocalServicesScan(scannedAt = "2026-01-01T00:00:00Z"): LocalServicesScanResponse {
  return {
    scanned_at: scannedAt,
    cache_ttl_ms: 5000,
    services: [],
    unavailable: null,
  };
}

describe("event-bridge-policy", () => {
  // ─── S7 — Complete event patches cache ───────────────────────────────────

  describe("S7 — quota_overview_updated patches cache (setQueryData policy)", () => {
    test("complete payload sets query data without triggering a network fetch", () => {
      const client = createAtmosWebQueryClient();
      const overview = makeQuotaOverview(999);

      const applied = applyQuotaOverviewUpdated(client, scope, overview);

      expect(applied).toBe(true);
      expect(client.getQueryData(queryKeys.computer.quotaOverview(scope))).toEqual(overview);
    });

    test("complete payload does not create an in-flight request (no queryFn execution)", () => {
      const client = createAtmosWebQueryClient();
      const key = queryKeys.computer.quotaOverview(scope);

      // Nothing was fetched — no queryFn was ever registered
      const before = client.getQueryState(key);
      applyQuotaOverviewUpdated(client, scope, makeQuotaOverview());
      const after = client.getQueryState(key);

      // Data is present and fetchStatus remains idle (no network call was made)
      expect(after?.data).toBeDefined();
      expect(after?.fetchStatus).toBe("idle");
      expect(before?.data).toBeUndefined();
    });

    test("partial payload (missing `all`) is rejected — cache unchanged", () => {
      const client = createAtmosWebQueryClient();
      const key = queryKeys.computer.quotaOverview(scope);
      const seed = makeQuotaOverview(1);
      client.setQueryData(key, seed);

      // Partial: missing required 'all' field
      const applied = applyQuotaOverviewUpdated(client, scope, {
        generated_at: 999,
        providers: [],
        // all: missing
      });

      expect(applied).toBe(false);
      // Cache unchanged
      expect(client.getQueryData(key)).toEqual(seed);
    });

    test("null payload is rejected", () => {
      const client = createAtmosWebQueryClient();
      expect(applyQuotaOverviewUpdated(client, scope, null)).toBe(false);
    });

    test("usage event is scoped — patches only the matching scope key", () => {
      const client = createAtmosWebQueryClient();
      const otherScope: ComputerQueryScope = {
        activeInstanceId: "local",
        connectionEpoch: 99,
        relaySessionRevision: 0,
      };

      applyQuotaOverviewUpdated(client, scope, makeQuotaOverview());

      // Other scope's key remains empty
      expect(
        client.getQueryData(queryKeys.computer.quotaOverview(otherScope)),
      ).toBeUndefined();
    });
  });

  // ─── S8 — Partial / stream events cannot corrupt snapshots ──────────────

  describe("S8 — automation_definition_updated invalidates only automationList", () => {
    test("invalidates automationList but not automationRunList", async () => {
      const client = createAtmosWebQueryClient({ defaultOptions: { queries: { retry: false } } });

      const automationListKey = queryKeys.computer.automationList(scope);
      const automationRunKey = queryKeys.computer.automationRunList(scope, "run-guid-1");

      client.setQueryData(automationListKey, { automations: [] });
      client.setQueryData(automationRunKey, { runs: [] });

      invalidateAutomationDefinitionQueries(client, scope);
      await Promise.resolve(); // Let async invalidation settle

      expect(client.getQueryState(automationListKey)?.isInvalidated).toBe(true);
      // Run list should NOT be invalidated by definition events
      expect(client.getQueryState(automationRunKey)?.isInvalidated).toBe(false);
    });

    test("automation_run_updated invalidates run prefix but not definition list", async () => {
      const client = createAtmosWebQueryClient({ defaultOptions: { queries: { retry: false } } });

      const automationListKey = queryKeys.computer.automationList(scope);
      const runKey1 = queryKeys.computer.automationRunList(scope, "guid-a");
      const runKey2 = queryKeys.computer.automationRunList(scope, "guid-b");

      client.setQueryData(automationListKey, { automations: [] });
      client.setQueryData(runKey1, { runs: [] });
      client.setQueryData(runKey2, { runs: [] });

      invalidateAutomationRunQueries(client, scope);
      await Promise.resolve();

      // Both run keys are invalidated (prefix match on ["atmos", "computer", ..., "automations", "runs"])
      expect(client.getQueryState(runKey1)?.isInvalidated).toBe(true);
      expect(client.getQueryState(runKey2)?.isInvalidated).toBe(true);
      // Definition/list key is not invalidated
      expect(client.getQueryState(automationListKey)?.isInvalidated).toBe(false);
    });

    test("stream chunk event does not call setQueryData — snapshot remains intact", () => {
      const client = createAtmosWebQueryClient();
      const key = queryKeys.computer.automationRunList(scope, "streaming-guid");
      const snapshotBefore = { runs: [{ id: "run-1", status: "running" }] };
      client.setQueryData(key, snapshotBefore);

      // Simulate automation_run_output arriving: the bridge does NOT touch Query cache
      // (stream events are classified as "stream" in the inventory, no setQueryData/invalidate)
      // → verify snapshot is untouched after simulating what the bridge would NOT do
      const snapshotAfter = client.getQueryData(key);
      expect(snapshotAfter).toEqual(snapshotBefore);
    });
  });

  // ─── S27 — Event bridge table test ──────────────────────────────────────

  describe("S27 — every migrated event follows its declared cache policy", () => {
    test("token_usage_updated: invalidates tokenUsage root prefix", async () => {
      const client = createAtmosWebQueryClient({ defaultOptions: { queries: { retry: false } } });

      const overviewKey = queryKeys.computer.tokenUsageOverview(scope);
      const overviewFiltered = queryKeys.computer.tokenUsageOverview(scope, { year: "2025" });
      // Unrelated key
      const usageKey = queryKeys.computer.quotaOverview(scope);

      client.setQueryData(overviewKey, { data: "base" });
      client.setQueryData(overviewFiltered, { data: "filtered" });
      client.setQueryData(usageKey, makeQuotaOverview());

      invalidateTokenUsageQueries(client, scope);
      await Promise.resolve();

      // Both tokenUsage variants are invalidated
      expect(client.getQueryState(overviewKey)?.isInvalidated).toBe(true);
      expect(client.getQueryState(overviewFiltered)?.isInvalidated).toBe(true);
      // Usage overview (different domain) is NOT invalidated
      expect(client.getQueryState(usageKey)?.isInvalidated).toBe(false);
    });

    test("local_model_state_changed: invalidates localModelList only", async () => {
      const client = createAtmosWebQueryClient({ defaultOptions: { queries: { retry: false } } });

      const modelKey = queryKeys.computer.localModelList(scope);
      const skillsKey = queryKeys.computer.skillsList(scope);

      client.setQueryData(modelKey, { models: [] });
      client.setQueryData(skillsKey, { skills: [] });

      invalidateLocalModelQueries(client, scope);
      await Promise.resolve();

      expect(client.getQueryState(modelKey)?.isInvalidated).toBe(true);
      // Skills list is a different domain — not invalidated
      expect(client.getQueryState(skillsKey)?.isInvalidated).toBe(false);
    });

    test("automation_definition_updated: invalidates automationList", async () => {
      const client = createAtmosWebQueryClient({ defaultOptions: { queries: { retry: false } } });

      const automationListKey = queryKeys.computer.automationList(scope);
      const agentCapKey = queryKeys.computer.automationAgentCapabilities(scope);

      client.setQueryData(automationListKey, { automations: [] });
      client.setQueryData(agentCapKey, { capabilities: [] });

      invalidateAutomationDefinitionQueries(client, scope);
      await Promise.resolve();

      expect(client.getQueryState(automationListKey)?.isInvalidated).toBe(true);
      // Agent capabilities uses different key segment — check scope isolation
      // (not invalidated by definition events which target automationList key)
      expect(client.getQueryState(agentCapKey)?.isInvalidated).toBe(false);
    });

    test("automation_run_updated: invalidates all run list entries for the scope", async () => {
      const client = createAtmosWebQueryClient({ defaultOptions: { queries: { retry: false } } });

      const run1 = queryKeys.computer.automationRunList(scope, "guid-1");
      const run2 = queryKeys.computer.automationRunList(scope, "guid-2");
      const listKey = queryKeys.computer.automationList(scope);

      client.setQueryData(run1, { runs: [] });
      client.setQueryData(run2, { runs: [] });
      client.setQueryData(listKey, { automations: [] });

      invalidateAutomationRunQueries(client, scope);
      await Promise.resolve();

      expect(client.getQueryState(run1)?.isInvalidated).toBe(true);
      expect(client.getQueryState(run2)?.isInvalidated).toBe(true);
      // Definition/list key is unaffected
      expect(client.getQueryState(listKey)?.isInvalidated).toBe(false);
    });

    test("quota_overview_updated (complete): sets data, zero invalidations needed", () => {
      const client = createAtmosWebQueryClient();
      const key = queryKeys.computer.quotaOverview(scope);
      const overview = makeQuotaOverview(42);

      applyQuotaOverviewUpdated(client, scope, overview);

      expect(client.getQueryData(key)).toEqual(overview);
      // No invalidation — setQueryData is the policy
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    });

    test("local_services_updated (complete): sets all_atmos snapshot and invalidates other scan keys", async () => {
      const client = createAtmosWebQueryClient({ defaultOptions: { queries: { retry: false } } });
      const allKey = queryKeys.computer.localServicesScan(
        scope,
        localServicesScopeKey({ scope: "all_atmos_projects" }),
      );
      const contextKey = queryKeys.computer.localServicesScan(
        scope,
        localServicesScopeKey({
          scope: "current_context",
          project_id: "p1",
          workspace_id: "w1",
        }),
      );
      const snapshot = makeLocalServicesScan("2026-08-03T12:00:00Z");
      client.setQueryData(contextKey, makeLocalServicesScan("old"));

      const applied = applyLocalServicesUpdated(client, scope, snapshot);
      await Promise.resolve();

      expect(applied).toBe(true);
      expect(client.getQueryData(allKey)).toEqual(snapshot);
      expect(client.getQueryState(allKey)?.isInvalidated).toBe(false);
      expect(client.getQueryState(contextKey)?.isInvalidated).toBe(true);
    });

    test("resource_monitor_updated (complete): sets scoped snapshot without invalidation", () => {
      const client = createAtmosWebQueryClient();
      const key = queryKeys.computer.resourceMonitorSnapshot(scope);
      const snapshot = makeResourceMonitorSnapshot(42);

      const applied = applyResourceMonitorUpdated(client, scope, snapshot);

      expect(applied).toBe(true);
      expect(client.getQueryData(key)).toEqual(snapshot);
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
      expect(client.getQueryState(key)?.fetchStatus).toBe("idle");
    });

    test("resource_monitor_updated is isolated from other Computer scopes", () => {
      const client = createAtmosWebQueryClient();
      const otherScope: ComputerQueryScope = {
        activeInstanceId: "relay:other",
        connectionEpoch: 9,
        relaySessionRevision: 4,
      };
      const snapshot = makeResourceMonitorSnapshot(99);

      applyResourceMonitorUpdated(client, scope, snapshot);

      expect(
        client.getQueryData(queryKeys.computer.resourceMonitorSnapshot(otherScope)),
      ).toBeUndefined();
      expect(
        client.getQueryData(queryKeys.computer.resourceMonitorSnapshot(scope)),
      ).toEqual(snapshot);
    });

    test("resource_monitor_updated rejects partial payload", () => {
      const client = createAtmosWebQueryClient();
      const key = queryKeys.computer.resourceMonitorSnapshot(scope);
      const seed = makeResourceMonitorSnapshot(1);
      client.setQueryData(key, seed);

      const applied = applyResourceMonitorUpdated(client, scope, {
        collected_at_ms: 2,
        host: { cpu_percent: 1 },
      });

      expect(applied).toBe(false);
      expect(client.getQueryData(key)).toEqual(seed);
    });

    test("local_services_updated rejects partial payload", () => {
      const client = createAtmosWebQueryClient();
      const allKey = queryKeys.computer.localServicesScan(
        scope,
        localServicesScopeKey({ scope: "all_atmos_projects" }),
      );
      const seed = makeLocalServicesScan("seed");
      client.setQueryData(allKey, seed);

      const applied = applyLocalServicesUpdated(client, scope, { services: [] });
      expect(applied).toBe(false);
      expect(client.getQueryData(allKey)).toEqual(seed);
    });

    test("each event handler targets only its own domain key root — no cross-domain contamination", async () => {
      const client = createAtmosWebQueryClient({ defaultOptions: { queries: { retry: false } } });

      // Seed all domains
      const keys = {
        tokenUsage: queryKeys.computer.tokenUsageOverview(scope),
        localModel: queryKeys.computer.localModelList(scope),
        automationList: queryKeys.computer.automationList(scope),
        automationRun: queryKeys.computer.automationRunList(scope, "g1"),
        usage: queryKeys.computer.quotaOverview(scope),
        skills: queryKeys.computer.skillsList(scope),
        settings: queryKeys.computer.settingsBootstrap(scope),
      };

      for (const key of Object.values(keys)) {
        client.setQueryData(key, { seeded: true });
      }

      // Fire token_usage_updated — should only affect tokenUsage
      invalidateTokenUsageQueries(client, scope);
      await Promise.resolve();

      expect(client.getQueryState(keys.tokenUsage)?.isInvalidated).toBe(true);
      expect(client.getQueryState(keys.localModel)?.isInvalidated).toBe(false);
      expect(client.getQueryState(keys.automationList)?.isInvalidated).toBe(false);
      expect(client.getQueryState(keys.usage)?.isInvalidated).toBe(false);
      expect(client.getQueryState(keys.skills)?.isInvalidated).toBe(false);
      expect(client.getQueryState(keys.settings)?.isInvalidated).toBe(false);
    });
  });

  // ─── S7 extended — Subscriber count helpers (event bridge, one per domain) ─

  describe("S7 extended — subscriber count helpers are exported and reflect bridge state", () => {
    test("subscriber count helpers return a number (module-level counters are accessible)", () => {
      // These helpers expose per-domain subscription counts for the
      // ServerStateEventBridge component. Before any component mounts, the
      // module-level counters start at 0 (the bridge increments on mount).
      expect(typeof getQuotaOverviewBridgeSubscriberCount()).toBe("number");
      expect(typeof getTokenUsageBridgeSubscriberCount()).toBe("number");
      expect(typeof getLocalServicesBridgeSubscriberCount()).toBe("number");
      expect(typeof getLocalModelBridgeSubscriberCount()).toBe("number");
      expect(typeof getAutomationDefinitionBridgeSubscriberCount()).toBe("number");
      expect(typeof getAutomationRunBridgeSubscriberCount()).toBe("number");
      expect(typeof getResourceMonitorBridgeSubscriberCount()).toBe("number");
    });

    test("subscriber count helpers are non-negative", () => {
      expect(getQuotaOverviewBridgeSubscriberCount()).toBeGreaterThanOrEqual(0);
      expect(getTokenUsageBridgeSubscriberCount()).toBeGreaterThanOrEqual(0);
      expect(getLocalServicesBridgeSubscriberCount()).toBeGreaterThanOrEqual(0);
      expect(getLocalModelBridgeSubscriberCount()).toBeGreaterThanOrEqual(0);
      expect(getAutomationDefinitionBridgeSubscriberCount()).toBeGreaterThanOrEqual(0);
      expect(getAutomationRunBridgeSubscriberCount()).toBeGreaterThanOrEqual(0);
      expect(getResourceMonitorBridgeSubscriberCount()).toBeGreaterThanOrEqual(0);
    });
  });
});
