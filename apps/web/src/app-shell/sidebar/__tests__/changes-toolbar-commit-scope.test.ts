import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const toolbar = readFileSync(
  join(import.meta.dir, "../ChangesToolbar.tsx"),
  "utf8",
);
const panel = readFileSync(
  join(import.meta.dir, "../../../features/git/components/ChangesPanel.tsx"),
  "utf8",
);

describe("ChangesToolbar commit scope", () => {
  test("restores Commit submenu with infinite scroll load-more", () => {
    expect(toolbar).toContain("DropdownMenuSub");
    expect(toolbar).toContain('t("changes.scope.commit")');
    expect(toolbar).toContain("useGitLogInfinite");
    expect(toolbar).toContain("onSelectCommit");
    expect(toolbar).toContain("handleCommitListScroll");
    expect(toolbar).toContain("fetchNextPage");
    expect(toolbar).toContain("loadingCommits");
    expect(toolbar).toContain("noCommitsOnBranch");
    expect(toolbar).toContain("TooltipContent");
    expect(toolbar).toContain("commit.subject");
  });
});

describe("ChangesPanel commit scope", () => {
  test("selects commit scope, compares against ref, and opens commit diffs", () => {
    expect(panel).toContain("handleSelectCommitScope");
    expect(panel).toContain("compareAgainstRef");
    expect(panel).toContain('buildDiffGroupPath("commit")');
    expect(panel).toContain("onSelectCommit={handleSelectCommitScope}");
    expect(panel).toContain('pendingScopeRequest.scope === "commit"');
    expect(panel).toContain("handleSelectCommitScope(pendingScopeRequest.commitHash)");
  });
});
