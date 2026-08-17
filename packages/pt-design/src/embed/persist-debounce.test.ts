import { describe, expect, test } from "bun:test";
import { emptyScene, type PtScene } from "../core/types";
import { createPersistDebouncer } from "./persist-debounce";

describe("persist debounce", () => {
  test("coalesces rapid schedules into one save and flushes leftover on unmount", () => {
    const saves: PtScene[] = [];
    let pending: (() => void) | null = null;
    const debouncer = createPersistDebouncer((scene) => {
      saves.push(scene);
    }, {
      delay: 250,
      schedule(fn) {
        pending = fn;
        return () => {
          pending = null;
        };
      },
    });
    const a = { ...emptyScene(), appState: { viewBackgroundColor: "#aaa" } };
    const b = { ...emptyScene(), appState: { viewBackgroundColor: "#bbb" } };
    const c = { ...emptyScene(), appState: { viewBackgroundColor: "#ccc" } };
    debouncer.schedule(a);
    debouncer.schedule(b);
    expect(saves).toEqual([]);
    pending?.();
    expect(saves).toHaveLength(1);
    expect(saves[0]?.appState.viewBackgroundColor).toBe("#bbb");
    debouncer.schedule(c);
    debouncer.flush();
    expect(saves).toHaveLength(2);
    expect(saves[1]?.appState.viewBackgroundColor).toBe("#ccc");
  });
});
