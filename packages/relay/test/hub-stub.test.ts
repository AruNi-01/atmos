import { describe, expect, test } from "bun:test";
import { getServerHub, parseHubLocationHint } from "../src/hub-stub";

describe("ServerHub placement hint", () => {
  test("accepts known region tokens and ignores unknown values", () => {
    expect(parseHubLocationHint("apac")).toBe("apac");
    expect(parseHubLocationHint(" WEUR ")).toBe("weur");
    expect(parseHubLocationHint("not-a-region")).toBeNull();
    expect(parseHubLocationHint("")).toBeNull();
    expect(parseHubLocationHint(undefined)).toBeNull();
  });

  test("warns when a non-empty hint is not a known region", () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0]));
    };
    const env = {
      RELAY_HUB_LOCATION_HINT: "ap-south",
      SERVER_HUB: {
        idFromName: (name: string) => ({ name }) as unknown as DurableObjectId,
        get: (id: DurableObjectId, options?: DurableObjectNamespaceGetDurableObjectOptions) => {
          return { id, options, fetch: async () => new Response(null) } as DurableObjectStub;
        },
      } as unknown as DurableObjectNamespace,
    };
    try {
      getServerHub(env, "computer-1");
    } finally {
      console.warn = original;
    }
    expect(warnings.some((line) => line.includes("RELAY_HUB_LOCATION_HINT"))).toBe(true);
  });

  test("passes the hint only when configured", () => {
    const calls: unknown[] = [];
    const env = {
      RELAY_HUB_LOCATION_HINT: "eeur",
      SERVER_HUB: {
        idFromName: (name: string) => ({ name }) as unknown as DurableObjectId,
        get: (id: DurableObjectId, options?: DurableObjectNamespaceGetDurableObjectOptions) => {
          calls.push({ id, options });
          return { fetch: async () => new Response(null) } as DurableObjectStub;
        },
      } as unknown as DurableObjectNamespace,
    };

    getServerHub(env, "computer-1");
    getServerHub({ ...env, RELAY_HUB_LOCATION_HINT: undefined }, "computer-1");

    expect(calls).toEqual([
      { id: { name: "computer-1" }, options: { locationHint: "eeur" } },
      { id: { name: "computer-1" }, options: undefined },
    ]);
  });
});
