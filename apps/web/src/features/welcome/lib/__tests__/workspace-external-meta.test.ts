import { describe, expect, it, mock } from "bun:test";
import type { WorkspaceLabel } from "@/shared/types/domain";
import {
  combinedExternalMeta,
  ensureWorkspaceLabelsForExternal,
  mergeExternalLabels,
} from "../workspace-external-meta";
import type { LinearIssuePayload } from "@atmos/api-types/ws/dto/linear";
import type { GithubIssuePayload } from "@/api/ws-api";

describe("mergeExternalLabels", () => {
  it("dedupes by name case-insensitively and keeps first color", () => {
    expect(
      mergeExternalLabels(
        [{ name: "Bug", color: "#f00" }],
        [{ name: "bug", color: "#0f0" }, { name: "Enhancement", color: "#00f" }],
      ),
    ).toEqual([
      { name: "Bug", color: "#f00" },
      { name: "Enhancement", color: "#00f" },
    ]);
  });
});

describe("ensureWorkspaceLabelsForExternal", () => {
  it("matches existing Atmos labels and creates missing ones", async () => {
    const existing: WorkspaceLabel[] = [
      {
        id: "l1",
        name: "Bug",
        color: "#111",
        source: "manual",
      } as WorkspaceLabel,
    ];
    const created: WorkspaceLabel[] = [];
    const createLabel = mock(async (input: { name: string; color: string }) => {
      const label = {
        id: `new-${input.name}`,
        name: input.name,
        color: input.color,
        source: "manual" as const,
      } as WorkspaceLabel;
      created.push(label);
      return label;
    });

    const selected = await ensureWorkspaceLabelsForExternal(
      [
        { name: "bug", color: "#f00" },
        { name: "Feature", color: "00ff00" },
      ],
      existing,
      createLabel,
      "manual",
    );

    expect(selected.map((l) => l.id)).toEqual(["l1", "new-Feature"]);
    expect(createLabel).toHaveBeenCalledTimes(1);
    expect(created[0]?.color).toBe("#00ff00");
  });
});

describe("combinedExternalMeta", () => {
  it("prefers Linear priority/status and unions labels with GitHub", () => {
    const linear = {
      id: "lin-1",
      identifier: "LAN-1",
      title: "T",
      url: "https://linear.app/x",
      priority: 1,
      state_type: "started",
      state_name: "In Progress",
      labels: [{ name: "FromLinear", color: "#abc" }],
      github_refs: [],
    } as LinearIssuePayload;

    const issue = {
      owner: "o",
      repo: "r",
      number: 9,
      title: "gh",
      body: null,
      url: "https://github.com/o/r/issues/9",
      state: "open",
      comments_count: 0,
      labels: [
        { name: "FromLinear", color: "#000", description: null },
        { name: "FromGithub", color: "ff00ff", description: null },
      ],
      assignees: [],
    } as GithubIssuePayload;

    const meta = combinedExternalMeta({ linear, issue });
    expect(meta.priority).toBe("urgent");
    expect(meta.workflowStatus).toBe("in_progress");
    expect(meta.labels.map((l) => l.name)).toEqual(["FromLinear", "FromGithub"]);
    expect(meta.labelSource).toBe("manual");
  });
});
