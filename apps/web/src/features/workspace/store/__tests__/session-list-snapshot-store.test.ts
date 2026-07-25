// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { beforeEach, describe, expect, it } from "bun:test";
import {
  clearSessionListSnapshots,
  sessionListKeys,
  useSessionListSnapshotStore,
} from "../session-list-snapshot-store";

const initial = useSessionListSnapshotStore.getInitialState();

describe("session-list-snapshot-store", () => {
  beforeEach(() => {
    useSessionListSnapshotStore.setState(initial, true);
  });

  it("set/get round-trips list snapshots", () => {
    const key = sessionListKeys.gitStatus("/repo/a");
    useSessionListSnapshotStore.getState().set(key, { branch: "main" });
    expect(useSessionListSnapshotStore.getState().get(key)).toEqual({ branch: "main" });
    expect(useSessionListSnapshotStore.getState().has(key)).toBe(true);
    expect(useSessionListSnapshotStore.getState().getUpdatedAt(key)).toBeGreaterThan(0);
  });

  it("survives independent of query lifecycle (session-long)", () => {
    const key = sessionListKeys.gitBranches("/repo/b");
    useSessionListSnapshotStore.getState().set(key, { local: ["main"], remote: ["origin/main"] });
    // Simulate Query GC / unmount: store is the session authority.
    expect(
      useSessionListSnapshotStore.getState().get<{ local: string[] }>(key)?.local,
    ).toEqual(["main"]);
  });

  it("clearAll drops every snapshot", () => {
    useSessionListSnapshotStore
      .getState()
      .set(sessionListKeys.fileTree("/repo", false), { tree: [] });
    useSessionListSnapshotStore
      .getState()
      .set(sessionListKeys.branchPrList({ owner: "o", repo: "r", branch: "main" }), []);
    clearSessionListSnapshots();
    expect(Object.keys(useSessionListSnapshotStore.getState().entries)).toEqual([]);
  });

  it("serialize keys stay stable for the same inputs", () => {
    expect(sessionListKeys.gitStatus("/a")).toBe(sessionListKeys.gitStatus("/a"));
    expect(
      sessionListKeys.gitLog("/a", "main", 0, 30),
    ).toBe(sessionListKeys.gitLog("/a", "main", 0, 30));
    expect(sessionListKeys.gitLog("/a", "main", 0, 30)).not.toBe(
      sessionListKeys.gitLog("/a", "main", 1, 30),
    );
  });
});
