import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { globalKey, removeKey } from "@/shared/lib/browser-store";
import {
  readPtDesignLastOpen,
  resolvePtDesignOpenTarget,
  writePtDesignLastOpen,
} from "./pt-design-last-open";

const SCOPE = "workspace-a";
const KEY = globalKey(`pt-design-last-open:${SCOPE}`);
const mem = new Map<string, string>();

beforeEach(() => {
  mem.clear();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
      removeItem: (key: string) => {
        mem.delete(key);
      },
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
  });
});

afterEach(() => {
  removeKey(KEY);
  mem.clear();
});

describe("pt-design last open canvas", () => {
  it("defaults to the file list", () => {
    expect(readPtDesignLastOpen(SCOPE)).toBeNull();
  });

  it("round-trips a canvas id and clears it for the file list", () => {
    writePtDesignLastOpen(SCOPE, "design-1");
    expect(readPtDesignLastOpen(SCOPE)).toBe("design-1");
    writePtDesignLastOpen(SCOPE, null);
    expect(readPtDesignLastOpen(SCOPE)).toBeNull();
  });

  it("keeps launchpad and workspace memories apart", () => {
    writePtDesignLastOpen("global", "launchpad-board");
    writePtDesignLastOpen(SCOPE, "workspace-board");
    expect(readPtDesignLastOpen("global")).toBe("launchpad-board");
    expect(readPtDesignLastOpen(SCOPE)).toBe("workspace-board");
    removeKey(globalKey("pt-design-last-open:global"));
  });

  it("ignores corrupt stored values", () => {
    localStorage.setItem(KEY, JSON.stringify({ id: "design-1" }));
    expect(readPtDesignLastOpen(SCOPE)).toBeNull();
  });
});

describe("resolvePtDesignOpenTarget", () => {
  const exists = (id: string) => id !== "missing";

  it("restores the stored canvas when the route dropped the query", () => {
    expect(
      resolvePtDesignOpenTarget({
        urlDesign: null,
        stored: "design-1",
        scopeChanged: false,
        docExists: exists,
      }),
    ).toEqual({ design: "design-1", persist: "design-1" });
  });

  it("stays on the file list after Back cleared the memory", () => {
    expect(
      resolvePtDesignOpenTarget({
        urlDesign: null,
        stored: null,
        scopeChanged: false,
        docExists: exists,
      }),
    ).toEqual({ design: null, persist: null });
  });

  it("honors a deep link and remembers it", () => {
    expect(
      resolvePtDesignOpenTarget({
        urlDesign: "design-2",
        stored: "design-1",
        scopeChanged: false,
        docExists: exists,
      }),
    ).toEqual({ design: "design-2", persist: "design-2" });
  });

  it("uses the destination workspace memory when the previous query is leftover", () => {
    expect(
      resolvePtDesignOpenTarget({
        urlDesign: "other-workspace-board",
        stored: "design-1",
        scopeChanged: true,
        docExists: exists,
      }),
    ).toEqual({ design: "design-1", persist: "design-1" });
  });

  it("opens the destination file list when that workspace has no canvas memory", () => {
    expect(
      resolvePtDesignOpenTarget({
        urlDesign: "other-workspace-board",
        stored: null,
        scopeChanged: true,
        docExists: exists,
      }),
    ).toEqual({ design: null, persist: null });
  });

  it("drops a remembered canvas whose file is gone", () => {
    expect(
      resolvePtDesignOpenTarget({
        urlDesign: null,
        stored: "missing",
        scopeChanged: false,
        docExists: exists,
      }),
    ).toEqual({ design: null, persist: null });
  });
});
