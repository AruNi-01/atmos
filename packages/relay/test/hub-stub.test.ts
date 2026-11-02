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
