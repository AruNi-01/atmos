/**
 * APP-035 · S9  — Target switch isolates Computer data
 *           S11 — Late response from the previous target is ignored
 *
 * These tests prove the scope-key isolation guarantee: cached data for one
 * Computer epoch cannot leak into another. They mirror the production lifecycle
 * that `prepareConnectionTargetChange` implements without importing it (the
 * function has many dynamic-import side effects that belong in integration tests).
 */

import { describe, expect, test } from "bun:test";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import { createAtmosWebQueryClient } from "@/providers/app/query-client";

// Two fixture scopes — same instance id, different epochs (simulates a target switch)
const scopeA: ComputerQueryScope = {
  activeInstanceId: "local",
  connectionEpoch: 1,
  relaySessionRevision: 0,
};
const scopeB: ComputerQueryScope = {
  activeInstanceId: "local",
  connectionEpoch: 2,
  relaySessionRevision: 0,
};

// Two fixture scopes — different instance ids (relay switch)
const scopeRelay: ComputerQueryScope = {
  activeInstanceId: "relay:server-99",
  connectionEpoch: 1,
  relaySessionRevision: 1,
};

describe("connection-isolation", () => {
  describe("S9 — target switch isolates Computer data", () => {
    test("different epoch produces a distinct computer root key", () => {
      expect(queryKeys.computer.root(scopeA)).not.toEqual(queryKeys.computer.root(scopeB));
    });

    test("different activeInstanceId produces a distinct computer root key", () => {
      expect(queryKeys.computer.root(scopeA)).not.toEqual(
        queryKeys.computer.root(scopeRelay),
      );
    });

    test("data set under scope A is not readable under scope B key", () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      client.setQueryData(queryKeys.computer.system(scopeA), { computer: "A-system" });
      client.setQueryData(queryKeys.computer.settingsBootstrap(scopeA), {
        settings: "A-settings",
      });

      // Scope B keys are distinct — no A value leaks
      expect(client.getQueryData(queryKeys.computer.system(scopeB))).toBeUndefined();
      expect(client.getQueryData(queryKeys.computer.settingsBootstrap(scopeB))).toBeUndefined();
    });

    test("removing all computer queries clears every A cache entry before B renders", () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      // Populate several A keys
      client.setQueryData(queryKeys.computer.system(scopeA), { from: "A" });
      client.setQueryData(queryKeys.computer.settingsBootstrap(scopeA), { s: "A" });
      client.setQueryData(queryKeys.computer.quotaOverview(scopeA), {
        generated_at: 1,
        providers: [],
        all: {},
        partial_failures: [],
        auto_refresh: { interval_minutes: null },
      });
      client.setQueryData(queryKeys.computer.projectBootstrap(scopeA), { projects: [] });

      // Target switch: cancel + remove all ["atmos", "computer"] root
      void client.cancelQueries({ queryKey: ["atmos", "computer"] });
      client.removeQueries({ queryKey: ["atmos", "computer"] });

      // All A entries are gone
      expect(client.getQueryData(queryKeys.computer.system(scopeA))).toBeUndefined();
      expect(client.getQueryData(queryKeys.computer.settingsBootstrap(scopeA))).toBeUndefined();
      expect(client.getQueryData(queryKeys.computer.quotaOverview(scopeA))).toBeUndefined();
      expect(client.getQueryData(queryKeys.computer.projectBootstrap(scopeA))).toBeUndefined();

      // B starts empty
      expect(client.getQueryData(queryKeys.computer.system(scopeB))).toBeUndefined();
    });

    test("relay scope key isolates relay data from computer data", () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      const relayScope = { relayUrl: "https://relay.atmos.land", authRevision: 1 };
      const relayKey = queryKeys.relay.root(relayScope);

      client.setQueryData(queryKeys.computer.system(scopeA), { comp: true });
      client.setQueryData(relayKey, { relay: true });

      // Removing computer root does not clear relay root
      client.removeQueries({ queryKey: ["atmos", "computer"] });

      expect(client.getQueryData(queryKeys.computer.system(scopeA))).toBeUndefined();
      expect(client.getQueryData(relayKey)).toEqual({ relay: true });

      // Removing relay root
      client.removeQueries({ queryKey: ["atmos", "relay"] });
      expect(client.getQueryData(relayKey)).toBeUndefined();
    });

    test("extended domain keys (skills, automations, github) are scoped under computer root", () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      // Populate extended domains under A
      client.setQueryData(queryKeys.computer.skillsList(scopeA), { skills: ["s1"] });
      client.setQueryData(queryKeys.computer.automationList(scopeA), { automations: [] });
      client.setQueryData(queryKeys.computer.githubRepoPrList(scopeA, { owner: "o", repo: "r" }), {
        prs: [],
      });

      // B scope → extended domain keys are different
      expect(client.getQueryData(queryKeys.computer.skillsList(scopeB))).toBeUndefined();
      expect(client.getQueryData(queryKeys.computer.automationList(scopeB))).toBeUndefined();

      // All wiped by root removal
      client.removeQueries({ queryKey: ["atmos", "computer"] });
      expect(client.getQueryData(queryKeys.computer.skillsList(scopeA))).toBeUndefined();
      expect(client.getQueryData(queryKeys.computer.automationList(scopeA))).toBeUndefined();
    });
  });

  describe("S11 — late response from the previous target is ignored", () => {
    test("A response resolved after target switch populates only old-epoch key, not new-epoch key", async () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });

      const keyA = queryKeys.computer.system(scopeA);
      const keyB = queryKeys.computer.system(scopeB);

      // Scenario:
      // 1. A fetch for scopeA is in-flight (represented here by a deferred promise)
      // 2. Target switches to scopeB (all computer queries removed, epoch bumped)
      // 3. The in-flight A response arrives and would populate keyA

      let resolveA!: (v: { from: string }) => void;
      const deferredA = new Promise<{ from: string }>((res) => {
        resolveA = res;
      });

      // Start fetch for A (in-flight)
      const fetchAPromise = client.fetchQuery({
        queryKey: keyA,
        queryFn: () => deferredA,
      });

      // Target switch: remove all computer queries (this cancels pending fetches too)
      void client.cancelQueries({ queryKey: ["atmos", "computer"] });
      client.removeQueries({ queryKey: ["atmos", "computer"] });

      // Late A response resolves (but the query was cancelled/removed)
      resolveA({ from: "A" });

      // fetchAPromise may resolve or reject depending on TanStack Query's cancel behavior
      try {
        await fetchAPromise;
      } catch {
        // Cancelled queries throw — that's fine
      }

      // B's key must remain untouched
      expect(client.getQueryData(keyB)).toBeUndefined();

      // A's key was removed by the switch — late response cannot re-populate it
      // (TanStack Query removes the cache entry; a later setQueryData would re-create it,
      //  but the in-flight queryFn result does not survive if the query was removed)
      expect(client.getQueryData(keyA)).toBeUndefined();
    });

    test("A data set before switch is absent after removeQueries — B reads only B-scoped data", () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      // A is active, data loaded
      client.setQueryData(queryKeys.computer.settingsBootstrap(scopeA), { theme: "dark" });
      client.setQueryData(queryKeys.computer.quotaOverview(scopeA), {
        generated_at: 100,
        providers: [],
        all: {},
        partial_failures: [],
        auto_refresh: { interval_minutes: null },
      });

      // Switch to B
      client.removeQueries({ queryKey: ["atmos", "computer"] });

      // B scope is clean
      expect(client.getQueryData(queryKeys.computer.settingsBootstrap(scopeB))).toBeUndefined();
      expect(client.getQueryData(queryKeys.computer.quotaOverview(scopeB))).toBeUndefined();

      // Set B data
      client.setQueryData(queryKeys.computer.settingsBootstrap(scopeB), { theme: "light" });

      // A data is still absent
      expect(client.getQueryData(queryKeys.computer.settingsBootstrap(scopeA))).toBeUndefined();
      // B data is visible
      expect(client.getQueryData(queryKeys.computer.settingsBootstrap(scopeB))).toEqual({
        theme: "light",
      });
    });

    test("epoch change in scope B key makes all A keys structurally distinct — no cross-epoch read possible", () => {
      // Pure key contract: prove that no value set under A can be retrieved under B
      // without knowing A's epoch.
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      const domains = [
        queryKeys.computer.system(scopeA),
        queryKeys.computer.settingsBootstrap(scopeA),
        queryKeys.computer.quotaOverview(scopeA),
        queryKeys.computer.projectBootstrap(scopeA),
        queryKeys.computer.gitAll(scopeA),
        queryKeys.computer.filesRoot(scopeA),
        queryKeys.computer.skillsList(scopeA),
        queryKeys.computer.automationList(scopeA),
        queryKeys.computer.localModelList(scopeA),
        queryKeys.computer.agentRegistryList(scopeA),
      ] as const;

      // Populate all under A
      for (const key of domains) {
        client.setQueryData(key, { from: "A" });
      }

      // B counterparts must all be undefined (no A value readable)
      const bDomains = [
        queryKeys.computer.system(scopeB),
        queryKeys.computer.settingsBootstrap(scopeB),
        queryKeys.computer.quotaOverview(scopeB),
        queryKeys.computer.projectBootstrap(scopeB),
        queryKeys.computer.gitAll(scopeB),
        queryKeys.computer.filesRoot(scopeB),
        queryKeys.computer.skillsList(scopeB),
        queryKeys.computer.automationList(scopeB),
        queryKeys.computer.localModelList(scopeB),
        queryKeys.computer.agentRegistryList(scopeB),
      ] as const;

      for (const key of bDomains) {
        expect(client.getQueryData(key)).toBeUndefined();
      }
    });
  });
});
