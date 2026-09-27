import { describe, expect, test } from "bun:test";
import {
  hostSessionArchiveAction,
  nextHostSessionSelection,
} from "@/features/agent-sessions/lib/host-session-selection";

describe("host session bulk selection", () => {
  const archived = new Set(["b"]);
  const isArchived = (key: string) => archived.has(key);

  test("archive action follows whether the selection is archived", () => {
    expect(hostSessionArchiveAction([], isArchived)).toBe("empty");
    expect(hostSessionArchiveAction(["a", "c"], isArchived)).toBe("archive");
    expect(hostSessionArchiveAction(["b"], isArchived)).toBe("unarchive");
    expect(hostSessionArchiveAction(["a", "b"], isArchived)).toBe("mixed");
  });

  test("select all toggles the visible keys", () => {
    const visible = ["a", "b"];
    const all = nextHostSessionSelection(new Set(), visible);
    expect([...all]).toEqual(visible);
    expect([...nextHostSessionSelection(all, visible)]).toEqual([]);
    expect([...nextHostSessionSelection(new Set(["a"]), visible)]).toEqual(visible);
    expect([...nextHostSessionSelection(new Set(["a"]), [])]).toEqual([]);
  });
});
