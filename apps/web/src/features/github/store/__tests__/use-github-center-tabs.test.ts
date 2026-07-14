import { beforeEach, describe, expect, it } from "bun:test";
import {
  buildGithubActionTabValue,
  buildGithubPullRequestTabValue,
  parseGithubCenterTabValue,
  useGithubCenterTabsStore,
} from "@/features/github/store/use-github-center-tabs";

describe("GitHub center tabs", () => {
  beforeEach(() => {
    useGithubCenterTabsStore.setState({ tabsByContext: {} });
  });

  it("builds and parses context-scoped tab values", () => {
    const value = buildGithubPullRequestTabValue("workspace:one", 42);

    expect(parseGithubCenterTabValue(value)).toEqual({
      kind: "github-pr",
      contextId: "workspace:one",
      itemId: 42,
    });
    expect(parseGithubCenterTabValue("github-pr:broken")).toBeNull();
    expect(parseGithubCenterTabValue("github-pr:%E0%A4%A:42")).toBeNull();
  });

  it("keeps one tab per item and updates repeated action opens", () => {
    const store = useGithubCenterTabsStore.getState();
    const firstRun = {
      databaseId: 101,
      workflowName: "CI",
      displayTitle: "Initial title",
      status: "completed",
      conclusion: "success",
      createdAt: "2026-07-14T00:00:00Z",
      url: "https://github.com/atmos/atmos/actions/runs/101",
      event: "push",
      headBranch: "main",
      headSha: "abcdef0",
    };

    store.openActionRun("workspace-1", {
      label: firstRun.displayTitle,
      owner: "atmos",
      repo: "atmos",
      run: firstRun,
      runId: firstRun.databaseId,
    });
    store.openActionRun("workspace-1", {
      label: "Updated title",
      owner: "atmos",
      repo: "atmos",
      run: { ...firstRun, displayTitle: "Updated title" },
      runId: firstRun.databaseId,
    });

    const tabs =
      useGithubCenterTabsStore.getState().tabsByContext["workspace-1"];
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.label).toBe("Updated title");
    expect(tabs[0]?.value).toBe(
      buildGithubActionTabValue("workspace-1", firstRun.databaseId),
    );
  });

  it("keeps tabs isolated by center context", () => {
    const store = useGithubCenterTabsStore.getState();
    const params = {
      branch: "main",
      label: "PR #7",
      owner: "atmos",
      prNumber: 7,
      repo: "atmos",
    };

    store.openPullRequest("workspace-1", params);
    store.openPullRequest("workspace-2", params);

    expect(
      useGithubCenterTabsStore.getState().tabsByContext["workspace-1"]?.[0]
        ?.value,
    ).toBe(buildGithubPullRequestTabValue("workspace-1", 7));
    expect(
      useGithubCenterTabsStore.getState().tabsByContext["workspace-2"]?.[0]
        ?.value,
    ).toBe(buildGithubPullRequestTabValue("workspace-2", 7));
  });
});
