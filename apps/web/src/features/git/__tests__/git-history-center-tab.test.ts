import { beforeEach, describe, expect, it } from "bun:test";
import { GIT_HISTORY_TAB_VALUE } from "../types";
import {
  isGitHistoryTabValue,
  useGitHistoryCenterTabStore,
} from "../store/use-git-history-center-tab";

describe("git history center tab store", () => {
  beforeEach(() => {
    useGitHistoryCenterTabStore.setState({
      visibleByContext: {},
      selectedCommitByContext: {},
    });
  });

  it("keeps one tab id per workspace", () => {
    expect(GIT_HISTORY_TAB_VALUE).toBe("git-history");
    expect(isGitHistoryTabValue("git-history")).toBe(true);
    expect(isGitHistoryTabValue("simulator")).toBe(false);
  });

  it("opens, selects, and closes per context", () => {
    const store = useGitHistoryCenterTabStore.getState();
    store.open("ws-1");
    store.selectCommit("ws-1", "abc123");
    store.open("ws-2");
    expect(useGitHistoryCenterTabStore.getState().isOpen("ws-1")).toBe(true);
    expect(useGitHistoryCenterTabStore.getState().isOpen("ws-2")).toBe(true);
    expect(
      useGitHistoryCenterTabStore.getState().selectedCommitByContext["ws-1"],
    ).toBe("abc123");
    expect(
      useGitHistoryCenterTabStore.getState().selectedCommitByContext["ws-2"],
    ).toBeUndefined();

    store.close("ws-1");
    expect(useGitHistoryCenterTabStore.getState().isOpen("ws-1")).toBe(false);
    expect(
      useGitHistoryCenterTabStore.getState().selectedCommitByContext["ws-1"],
    ).toBe("abc123");
  });
});
