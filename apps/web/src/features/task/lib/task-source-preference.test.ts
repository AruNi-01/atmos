import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  readStoredTaskSource,
  tasksPathWithStoredSource,
  writeStoredTaskSource,
} from "@/features/task/lib/task-source-preference";
import { globalKey, removeKey } from "@/shared/lib/browser-store";

const KEY = globalKey("taskSource");
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

describe("task-source-preference", () => {
  it("round-trips stored source", () => {
    writeStoredTaskSource("linear");
    expect(readStoredTaskSource()).toBe("linear");
  });

  it("builds tasks path with non-default source", () => {
    writeStoredTaskSource("github");
    expect(tasksPathWithStoredSource()).toBe("/tasks?taskSource=github");
  });

  it("uses plain /tasks for atmos or empty", () => {
    expect(tasksPathWithStoredSource()).toBe("/tasks");
    writeStoredTaskSource("atmos");
    expect(tasksPathWithStoredSource()).toBe("/tasks");
  });
});
