import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  githubKeptSurfacePropsAreEqual,
  type GithubKeptSurfaceProps,
} from "@/app-shell/github-kept-surface-equality";
import type { GithubCenterTab } from "@/features/github/store/use-github-center-tabs";

function prTab(overrides: Partial<Extract<GithubCenterTab, { kind: "github-pr" }>> = {}) {
  return {
    id: "pr-1",
    value: "github-pr:ws:42",
    contextId: "ws",
    owner: "acme",
    repo: "app",
    label: "PR 42",
    openedAt: 1,
    kind: "github-pr" as const,
    branch: "main",
    prNumber: 42,
    ...overrides,
  };
}

function actionTab(
  overrides: Partial<Extract<GithubCenterTab, { kind: "github-action" }>> = {},
) {
  return {
    id: "run-1",
    value: "github-action:ws:9",
    contextId: "ws",
    owner: "acme",
    repo: "app",
    label: "CI",
    openedAt: 1,
    kind: "github-action" as const,
    runId: 9,
    run: null,
    ...overrides,
  };
}

function props(tab: GithubCenterTab, extra: Partial<GithubKeptSurfaceProps> = {}): GithubKeptSurfaceProps {
  return { tab, active: true, ...extra };
}

describe("githubKeptSurfacePropsAreEqual", () => {
  it("skips when only the tab object identity changes", () => {
    const prev = props(prTab());
    const next = props(prTab());
    expect(prev.tab).not.toBe(next.tab);
    expect(githubKeptSurfacePropsAreEqual(prev, next)).toBe(true);
  });

  it("skips when only the CI run stub object identity changes", () => {
    const onCloseTab = () => {};
    const prev = props(actionTab(), { onCloseTab });
    const next = props(actionTab({ run: { databaseId: 9 } as never }), { onCloseTab });
    expect(githubKeptSurfacePropsAreEqual(prev, next)).toBe(true);
  });

  it("re-renders when workspace-active flips, not for a missing paneVisible prop", () => {
    const tab = prTab();
    expect(githubKeptSurfacePropsAreEqual(props(tab, { active: true }), props(tab, { active: false }))).toBe(
      false,
    );
    expect("paneVisible" in props(tab)).toBe(false);
  });
});

describe("keep-alive center views source", () => {
  it("does not pass pane visibility into GitHub detail queries", () => {
    const src = readFileSync(
      join(import.meta.dir, "../keep-alive-center-views.tsx"),
      "utf8",
    );
    expect(src).toContain("active={active}");
    expect(src).not.toContain("paneVisible");
    expect(src).toContain("githubKeptSurfacePropsAreEqual");
  });
});
