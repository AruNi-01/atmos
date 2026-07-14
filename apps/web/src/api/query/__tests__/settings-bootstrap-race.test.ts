/**
 * APP-035 · S24 — Settings bootstrap cannot overwrite a newer mutation
 *
 * Scenario: A settings-bootstrap query is in-flight when a function-settings
 * mutation succeeds. The mutation calls `setQueryData` with the authoritative
 * new value. When the background bootstrap query later resolves, it must not
 * overwrite the mutated section.
 *
 * The correct implementation pattern is:
 *  - Before the mutation, call `cancelQueries` to abort the in-flight bootstrap.
 *  - On mutation success, call `setQueryData` (full merge) or `invalidateQueries`
 *    to re-fetch with the now-committed value.
 *
 * These tests prove:
 * 1. TanStack Query's `cancelQueries` aborts the in-flight bootstrap fetch.
 * 2. After `setQueryData` with a mutation result, the query cache holds the
 *    mutated value regardless of query resolve ordering.
 * 3. A manual `setQueryData` updater that merges sections can protect specific
 *    fields from being overwritten by a later stale bootstrap resolve.
 */

import { describe, expect, test } from "bun:test";
import { createAtmosWebQueryClient } from "@/providers/app/query-client";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";

const scope: ComputerQueryScope = {
  activeInstanceId: "local",
  connectionEpoch: 1,
  relaySessionRevision: 0,
};

const bootstrapKey = queryKeys.computer.settingsBootstrap(scope);

interface FakeBootstrap {
  function_settings: { theme: string };
  llm_providers: { count: number };
  updatedAt?: number;
}

describe("settings-bootstrap-race", () => {
  describe("S24 — mutation value survives when bootstrap arrives out of order", () => {
    test("setQueryData from mutation is preserved when queryFn has not yet resolved", async () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });

      let resolveBootstrap!: (v: FakeBootstrap) => void;
      const deferredBootstrap = new Promise<FakeBootstrap>((res) => {
        resolveBootstrap = res;
      });

      // 1. Bootstrap query starts (in-flight)
      const bootstrapPromise = client.fetchQuery<FakeBootstrap>({
        queryKey: bootstrapKey,
        queryFn: () => deferredBootstrap,
      });

      // 2. Mutation succeeds — writes the authoritative new settings before bootstrap resolves
      const mutationResult: FakeBootstrap = {
        function_settings: { theme: "dark" },
        llm_providers: { count: 3 },
      };
      // Cancel in-flight bootstrap before mutation writes (prevents race overwrite)
      await client.cancelQueries({ queryKey: bootstrapKey });
      client.setQueryData(bootstrapKey, mutationResult);

      // 3. Old bootstrap resolves (after cancel — TanStack may ignore the result)
      resolveBootstrap({
        function_settings: { theme: "light" }, // stale value
        llm_providers: { count: 1 },
      });
      try {
        await bootstrapPromise;
      } catch {
        // Cancelled queries may throw — that's expected
      }

      // Mutation result should be authoritative
      const cached = client.getQueryData<FakeBootstrap>(bootstrapKey);
      expect(cached).toEqual(mutationResult);
    });

    test("invalidateQueries after mutation triggers a fresh fetch rather than accepting stale bootstrap", async () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });

      const refreshedValue: FakeBootstrap = {
        function_settings: { theme: "dark" },
        llm_providers: { count: 5 },
      };

      // Seed with stale bootstrap
      client.setQueryData(bootstrapKey, {
        function_settings: { theme: "light" },
        llm_providers: { count: 1 },
      });

      // Mutation: mark bootstrap stale, provide updated fn
      await client.invalidateQueries({ queryKey: bootstrapKey, refetchType: "none" });
      expect(client.getQueryState(bootstrapKey)?.isInvalidated).toBe(true);

      // Subsequent fetch returns the refreshed value (simulating post-mutation re-fetch)
      await client.fetchQuery<FakeBootstrap>({
        queryKey: bootstrapKey,
        queryFn: () => Promise.resolve(refreshedValue),
        staleTime: 0,
      });

      expect(client.getQueryData<FakeBootstrap>(bootstrapKey)).toEqual(refreshedValue);
    });

    test("updater function pattern: mutation section protected from stale bootstrap overwrite", async () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });

      const staleBootstrap: FakeBootstrap = {
        function_settings: { theme: "light" },
        llm_providers: { count: 1 },
        updatedAt: 100,
      };

      // Seed with initial bootstrap
      client.setQueryData(bootstrapKey, staleBootstrap);

      // Mutation at t=200 mutates function_settings
      const mutatedAt = 200;
      client.setQueryData<FakeBootstrap>(bootstrapKey, (old) => ({
        ...old!,
        function_settings: { theme: "dark" },
        updatedAt: mutatedAt,
      }));

      expect(client.getQueryData<FakeBootstrap>(bootstrapKey)?.function_settings).toEqual({
        theme: "dark",
      });

      // Old bootstrap arrives with t=100 — should NOT overwrite mutation (t=200)
      // A version-aware updater rejects writes older than current timestamp
      const oldBootstrapTimestamp = 100;
      client.setQueryData<FakeBootstrap>(bootstrapKey, (old) => {
        if (old && old.updatedAt !== undefined && oldBootstrapTimestamp <= old.updatedAt) {
          // Stale write — reject, keep current
          return old;
        }
        return staleBootstrap;
      });

      // Mutation value is preserved
      const final = client.getQueryData<FakeBootstrap>(bootstrapKey);
      expect(final?.function_settings).toEqual({ theme: "dark" });
      expect(final?.updatedAt).toBe(mutatedAt);
    });

    test("untouched sections are populated from bootstrap without affecting mutated sections", () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      // Start empty
      expect(client.getQueryData(bootstrapKey)).toBeUndefined();

      // Bootstrap provides full payload
      const bootstrap: FakeBootstrap = {
        function_settings: { theme: "light" },
        llm_providers: { count: 2 },
      };
      client.setQueryData(bootstrapKey, bootstrap);

      // Mutation changes only function_settings
      client.setQueryData<FakeBootstrap>(bootstrapKey, (old) => ({
        ...old!,
        function_settings: { theme: "dark" },
      }));

      const result = client.getQueryData<FakeBootstrap>(bootstrapKey);
      // Mutated section: updated
      expect(result?.function_settings).toEqual({ theme: "dark" });
      // Untouched section: preserved from bootstrap
      expect(result?.llm_providers).toEqual({ count: 2 });
    });

    test("cancelQueries prevents a parallel bootstrap from overwriting setQueryData", async () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });

      let bootstrapResolveFn!: (v: FakeBootstrap) => void;
      const bootstrapDeferred = new Promise<FakeBootstrap>((res) => {
        bootstrapResolveFn = res;
      });

      // Start in-flight bootstrap
      const inflight = client.fetchQuery<FakeBootstrap>({
        queryKey: bootstrapKey,
        queryFn: () => bootstrapDeferred,
      });

      // Mutation success path:
      // 1. Cancel in-flight bootstrap
      await client.cancelQueries({ queryKey: bootstrapKey });
      // 2. Write mutated value
      client.setQueryData<FakeBootstrap>(bootstrapKey, {
        function_settings: { theme: "dark" },
        llm_providers: { count: 10 },
      });

      // Resolve the old bootstrap (after cancel)
      bootstrapResolveFn({ function_settings: { theme: "light" }, llm_providers: { count: 1 } });
      try {
        await inflight;
      } catch {
        // Cancel may cause rejection — expected
      }

      const cached = client.getQueryData<FakeBootstrap>(bootstrapKey);
      // Mutation value wins
      expect(cached?.function_settings).toEqual({ theme: "dark" });
    });
  });
});
