// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import type { GithubPrPayload } from "@/api/ws/github-api";
import {
  countChecksByTone,
  getChecksIconTone,
  hasRunningChecks,
  normalizePrLifecycleState,
  resolvePrIconColorClass,
  resolvePrStateChipClassName,
  resolveWorkspacePrPresentation,
  toneForStatusCheck,
} from "@/features/github/lib/workspace-pr-status";

const basePr: GithubPrPayload = {
  owner: "acme",
  repo: "app",
  number: 42,
  title: "Add feature",
  body: null,
  url: "https://github.com/acme/app/pull/42",
  state: "open",
  head_ref: "feat/x",
  base_ref: "main",
  is_draft: false,
  labels: [],
};

describe("normalizePrLifecycleState", () => {
  it("normalizes open / closed / merged casings", () => {
    expect(normalizePrLifecycleState("OPEN")).toBe("open");
    expect(normalizePrLifecycleState("open")).toBe("open");
    expect(normalizePrLifecycleState("CLOSED")).toBe("closed");
    expect(normalizePrLifecycleState("MERGED")).toBe("merged");
    expect(normalizePrLifecycleState(null)).toBe("open");
  });

  it("marks open+draft as draft, but not closed/merged", () => {
    expect(normalizePrLifecycleState("OPEN", true)).toBe("draft");
    expect(normalizePrLifecycleState("open", true)).toBe("draft");
    expect(normalizePrLifecycleState("CLOSED", true)).toBe("closed");
    expect(normalizePrLifecycleState("MERGED", true)).toBe("merged");
  });
});

describe("toneForStatusCheck / getChecksIconTone", () => {
  it("marks failure checks as failure tone", () => {
    expect(toneForStatusCheck({ state: "FAILURE" })).toBe("failure");
    expect(toneForStatusCheck({ conclusion: "TIMED_OUT" })).toBe("failure");
  });

  it("prefers failure over success for icon color", () => {
    expect(
      getChecksIconTone([
        { state: "SUCCESS" },
        { state: "FAILURE" },
      ]),
    ).toBe("failure");
  });

  it("returns success only when checks pass without failure/running", () => {
    expect(
      getChecksIconTone([
        { state: "SUCCESS" },
        { conclusion: "SKIPPED" },
      ]),
    ).toBe("success");
  });

  it("uses yellow/running when checks are still in progress", () => {
    expect(
      getChecksIconTone([
        { state: "SUCCESS" },
        { state: "PENDING" },
      ]),
    ).toBe("running");
    expect(hasRunningChecks([{ status: "IN_PROGRESS" }])).toBe(true);
  });

  it("returns neutral when there are no checks", () => {
    expect(getChecksIconTone([])).toBe("neutral");
  });

  it("counts checks by tone for tooltips", () => {
    expect(
      countChecksByTone([
        { state: "SUCCESS" },
        { state: "SUCCESS" },
        { state: "PENDING" },
        { state: "FAILURE" },
        { conclusion: "SKIPPED" },
      ]),
    ).toEqual({
      success: 2,
      running: 1,
      failure: 1,
      neutral: 1,
    });
  });
});

describe("resolvePrIconColorClass", () => {
  it("uses GitHub lifecycle colors for draft / merged / closed", () => {
    expect(resolvePrIconColorClass("draft", "success")).toBe("text-muted-foreground");
    expect(resolvePrIconColorClass("merged", "failure")).toBe("text-purple-500");
    expect(resolvePrIconColorClass("closed", "running")).toBe("text-red-500");
  });

  it("lets checks drive open PR color", () => {
    expect(resolvePrIconColorClass("open", "failure")).toBe("text-red-500");
    expect(resolvePrIconColorClass("open", "running")).toBe("text-amber-500");
    expect(resolvePrIconColorClass("open", "success")).toBe("text-emerald-500");
    expect(resolvePrIconColorClass("open", "neutral")).toBe("text-emerald-500");
  });
});

describe("resolvePrStateChipClassName", () => {
  it("matches GitHub lifecycle chip colors", () => {
    expect(resolvePrStateChipClassName("open")).toContain("emerald");
    expect(resolvePrStateChipClassName("draft")).toContain("muted");
    expect(resolvePrStateChipClassName("merged")).toContain("purple");
    expect(resolvePrStateChipClassName("closed")).toContain("red");
  });
});

describe("resolveWorkspacePrPresentation", () => {
  it("prefers live detail over branch list and managed snapshot", () => {
    const presentation = resolveWorkspacePrPresentation({
      managed: basePr,
      branchPr: { number: 42, state: "OPEN", title: "Branch title" },
      detail: {
        state: "MERGED",
        title: "Detail title",
        url: "https://github.com/acme/app/pull/42",
        statusCheckRollup: [{ state: "SUCCESS" }],
      },
    });

    expect(presentation.state).toBe("merged");
    expect(presentation.title).toBe("Detail title");
    expect(presentation.checksTone).toBe("success");
    expect(presentation.checksRunning).toBe(false);
  });

  it("surfaces draft lifecycle when isDraft is true on an open PR", () => {
    const presentation = resolveWorkspacePrPresentation({
      managed: { ...basePr, is_draft: true },
      detail: { state: "OPEN", isDraft: true },
    });
    expect(presentation.state).toBe("draft");
    expect(presentation.isDraft).toBe(true);
  });

  it("falls back to managed snapshot when no live data", () => {
    const presentation = resolveWorkspacePrPresentation({
      managed: { ...basePr, state: "closed", title: "Stored" },
    });
    expect(presentation.state).toBe("closed");
    expect(presentation.title).toBe("Stored");
    expect(presentation.checks).toEqual([]);
    expect(presentation.checksTone).toBe("neutral");
  });
});
