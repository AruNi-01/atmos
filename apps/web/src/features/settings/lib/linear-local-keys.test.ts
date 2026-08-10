import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  __resetLinearLocalKeysForTests,
  clearLinearAuthSelection,
  defaultLinearKeyName,
  ensureLinearLocalKeysHydrated,
  getActiveLinearApiKeyForRequest,
  getLinearAuthSelection,
  getLinearLocalStoreSnapshot,
  listLinearLocalKeys,
  removeLinearLocalKey,
  resolveLinearCredentialSource,
  selectLinearLocalKey,
  selectLinearOauth,
  upsertLinearLocalKey,
} from "./linear-local-keys";

const mem = new Map<string, string>();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  mem.clear();
  __resetLinearLocalKeysForTests();
  // Force browser-fallback path: no Computer API / disk.
  globalThis.fetch = (async () => {
    throw new Error("disk unavailable in unit test");
  }) as typeof fetch;
});

afterEach(() => {
  mem.clear();
  __resetLinearLocalKeysForTests();
  globalThis.fetch = originalFetch;
});

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
  },
  configurable: true,
});

describe("linear-local-keys (browser fallback)", () => {
  test("upsert, select, and resolve active key", async () => {
    await ensureLinearLocalKeysHydrated();
    await clearLinearAuthSelection();
    const a = await upsertLinearLocalKey({
      name: "Work",
      api_key: "lin_a".padEnd(32, "x"),
      viewer_name: "Ada",
    });
    const b = await upsertLinearLocalKey({
      name: "Personal",
      api_key: "lin_b".padEnd(32, "y"),
    });
    expect(listLinearLocalKeys()).toHaveLength(2);
    await selectLinearLocalKey(a.id);
    expect(getLinearAuthSelection()).toEqual({ mode: "local", keyId: a.id });
    expect(getActiveLinearApiKeyForRequest()).toBe(a.api_key);
    await selectLinearLocalKey(b.id);
    expect(getActiveLinearApiKeyForRequest()).toBe(b.api_key);
    await selectLinearOauth();
    expect(getActiveLinearApiKeyForRequest()).toBeUndefined();
    expect(getLinearLocalStoreSnapshot().onDisk).toBe(false);
  });

  test("remove active key clears selection when last", async () => {
    await ensureLinearLocalKeysHydrated();
    await clearLinearAuthSelection();
    const only = await upsertLinearLocalKey({
      name: "Solo",
      api_key: "lin_solo".padEnd(32, "z"),
    });
    await selectLinearLocalKey(only.id);
    await removeLinearLocalKey(only.id);
    expect(listLinearLocalKeys()).toHaveLength(0);
    expect(getLinearAuthSelection()).toEqual({ mode: "none" });
  });

  test("defaultLinearKeyName is non-empty", () => {
    expect(defaultLinearKeyName().length).toBeGreaterThan(3);
  });

  test("resolveLinearCredentialSource prefers selection", () => {
    expect(
      resolveLinearCredentialSource({
        selection: { mode: "local", keyId: "1" },
        oauthConnected: true,
        hasLocalKey: true,
      }),
    ).toBe("local");
    expect(
      resolveLinearCredentialSource({
        selection: { mode: "oauth" },
        oauthConnected: true,
        hasLocalKey: true,
      }),
    ).toBe("oauth");
  });
});
