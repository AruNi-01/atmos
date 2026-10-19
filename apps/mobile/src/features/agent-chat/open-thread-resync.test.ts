// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { applyOpenThreadResync, type OpenThreadResyncCtrl } from "./open-thread-resync";

function ctrl(overflowed = false): OpenThreadResyncCtrl {
  return { overflowed, resyncFetchGen: 0, cancelled: false };
}

describe("applyOpenThreadResync", () => {
  test("applies the incoming snapshot when the ring has not overflowed", async () => {
    const published: string[] = [];
    let fetched = 0;
    const state = ctrl(false);
    const result = await applyOpenThreadResync({
      ctrl: state,
      incoming: "incoming",
      fetchReplacement: async () => {
        fetched += 1;
        return "replacement";
      },
      publish: (snapshot) => published.push(snapshot),
    });
    expect(result).toBe("applied-incoming");
    expect(published).toEqual(["incoming"]);
    expect(fetched).toBe(0);
    expect(state.overflowed).toBe(false);
  });

  test("holds the current transcript when the replacement get fails", async () => {
    const published: string[] = [];
    const state = ctrl(true);
    const result = await applyOpenThreadResync({
      ctrl: state,
      incoming: "incoming",
      fetchReplacement: async () => {
        throw new Error("get failed");
      },
      publish: (snapshot) => published.push(snapshot),
    });
    expect(result).toBe("held");
    expect(published).toEqual([]);
    expect(state.overflowed).toBe(true);
  });

  test("applies only the replacement snapshot after overflow", async () => {
    const published: string[] = [];
    const state = ctrl(true);
    const result = await applyOpenThreadResync({
      ctrl: state,
      incoming: "incoming",
      fetchReplacement: async () => "replacement",
      publish: (snapshot) => published.push(snapshot),
    });
    expect(result).toBe("applied-replacement");
    expect(published).toEqual(["replacement"]);
    expect(state.overflowed).toBe(false);
  });

  test("ignores a stale replacement get after a newer resync", async () => {
    const published: string[] = [];
    const state = ctrl(true);
    let releaseFirst: (snapshot: string) => void = () => undefined;
    const first = applyOpenThreadResync({
      ctrl: state,
      incoming: "incoming-1",
      fetchReplacement: () =>
        new Promise<string>((resolve) => {
          releaseFirst = resolve;
        }),
      publish: (snapshot) => published.push(snapshot),
    });
    await Promise.resolve();
    const second = applyOpenThreadResync({
      ctrl: state,
      incoming: "incoming-2",
      fetchReplacement: async () => "replacement-2",
      publish: (snapshot) => published.push(snapshot),
    });
    expect(await second).toBe("applied-replacement");
    releaseFirst("replacement-1");
    expect(await first).toBe("held");
    expect(published).toEqual(["replacement-2"]);
    expect(state.overflowed).toBe(false);
  });
});
