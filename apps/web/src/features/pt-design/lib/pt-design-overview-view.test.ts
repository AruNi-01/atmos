import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { globalKey, removeKey } from "@/shared/lib/browser-store";
import {
  readPtDesignOverviewView,
  writePtDesignOverviewView,
} from "./pt-design-overview-view";

const KEY = globalKey("pt-design-overview-view");
const mem = new Map<string, string>();

beforeEach(() => {
  mem.clear();
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
  Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
  });
});

afterEach(() => {
  removeKey(KEY);
  mem.clear();
});

describe("pt-design overview view preference", () => {
  it("defaults to board", () => {
    expect(readPtDesignOverviewView()).toBe("board");
  });

  it("round-trips list", () => {
    writePtDesignOverviewView("list");
    expect(readPtDesignOverviewView()).toBe("list");
  });

  it("ignores unknown stored values", () => {
    localStorage.setItem(KEY, JSON.stringify("kanban"));
    expect(readPtDesignOverviewView()).toBe("board");
  });
});
