/**
 * APP-035 · S3 — Concurrent equivalent reads deduplicate
 *           S4 — Background refresh retains useful data
 */

import { describe, expect, test } from "bun:test";
import { createAtmosWebQueryClient } from "@/providers/app/query-client";

describe("query-deduplication", () => {
  describe("S3 — concurrent equivalent reads deduplicate", () => {
    test("two concurrent fetchQuery calls with the same key issue one underlying request", async () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      let callCount = 0;

      let resolveFn!: (v: { value: number }) => void;
      const deferred = new Promise<{ value: number }>((res) => {
        resolveFn = res;
      });

      const queryFn = () => {
        callCount++;
        return deferred;
      };

      const queryKey = ["s3", "dedup"];

      // Start two concurrent fetches before resolving
      const p1 = client.fetchQuery({ queryKey, queryFn });
      const p2 = client.fetchQuery({ queryKey, queryFn });
      // Resolve the shared in-flight request
      resolveFn({ value: 42 });

      const [r1, r2] = await Promise.all([p1, p2]);

      // Only one underlying network call for two concurrent consumers
      expect(callCount).toBe(1);
      expect(r1).toEqual({ value: 42 });
      expect(r2).toEqual({ value: 42 });
      expect(r1).toEqual(r2);
    });

    test("three concurrent observers on same key share one in-flight request", async () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      let callCount = 0;

      let resolveFn!: (v: string) => void;
      const deferred = new Promise<string>((res) => {
        resolveFn = res;
      });

      const queryFn = () => {
        callCount++;
        return deferred;
      };

      const key = ["s3", "triple-dedup"];
      const p1 = client.fetchQuery({ queryKey: key, queryFn });
      const p2 = client.fetchQuery({ queryKey: key, queryFn });
      const p3 = client.fetchQuery({ queryKey: key, queryFn });
      resolveFn("shared-result");

      const results = await Promise.all([p1, p2, p3]);

      expect(callCount).toBe(1);
      expect(new Set(results).size).toBe(1);
      expect(results[0]).toBe("shared-result");
    });

    test("different query keys do NOT deduplicate — each key fetches independently", async () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      let callCount = 0;

      const queryFn = async () => {
        callCount++;
        return { value: callCount };
      };

      await Promise.all([
        client.fetchQuery({ queryKey: ["s3", "keyA"], queryFn }),
        client.fetchQuery({ queryKey: ["s3", "keyB"], queryFn }),
      ]);

      expect(callCount).toBe(2);
    });
  });

  describe("S4 — background refresh retains useful data", () => {
    test("failed background refresh does not clear cached data", async () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });

      const queryKey = ["s4", "bg-refresh"];
      const originalData = { value: "cached-snapshot" };

      // Seed with successful data
      client.setQueryData(queryKey, originalData);
      expect(client.getQueryData(queryKey)).toEqual(originalData);

      // Attempt a refresh that fails (staleTime: 0 forces re-fetch)
      let fetchCalls = 0;
      try {
        await client.fetchQuery({
          queryKey,
          queryFn: () => {
            fetchCalls++;
            throw new Error("server unavailable");
          },
          staleTime: 0,
        });
      } catch {
        // Expected failure
      }

      // Prior data must remain in cache after failed refresh
      expect(client.getQueryData(queryKey)).toEqual(originalData);
      expect(fetchCalls).toBe(1);
    });

    test("background refresh failure leaves error state with prior data accessible", async () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });

      const queryKey = ["s4", "error-state"];
      const seedData = { status: "ok", count: 5 };

      // Seed cache
      client.setQueryData(queryKey, seedData);

      // Fetch fails
      try {
        await client.fetchQuery({
          queryKey,
          queryFn: () => Promise.reject(new Error("network error")),
          staleTime: 0,
        });
      } catch {
        // Expected
      }

      const state = client.getQueryState(queryKey);
      // Data is retained (TanStack Query keeps last successful data on error)
      expect(state?.data).toEqual(seedData);
      // Error is set
      expect(state?.error).toBeInstanceOf(Error);
    });

    test("successful background refresh replaces prior data", async () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });

      const queryKey = ["s4", "success-refresh"];
      const oldData = { version: 1 };
      const newData = { version: 2 };

      client.setQueryData(queryKey, oldData);

      await client.fetchQuery({
        queryKey,
        queryFn: () => Promise.resolve(newData),
        staleTime: 0,
      });

      expect(client.getQueryData(queryKey)).toEqual(newData);
    });

    test("invalidation marks query stale without clearing existing data", async () => {
      const client = createAtmosWebQueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      const queryKey = ["s4", "invalidate-data"];
      const data = { loaded: true };

      client.setQueryData(queryKey, data);

      // Invalidate (no active observers → marks stale, does not clear)
      await client.invalidateQueries({ queryKey, refetchType: "none" });

      // Data is still present (invalidation does not clear)
      expect(client.getQueryData(queryKey)).toEqual(data);
      expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
    });
  });
});
