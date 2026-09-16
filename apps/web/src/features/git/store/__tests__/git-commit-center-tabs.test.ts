import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const storePath = join(import.meta.dir, "../use-git-commit-center-tabs.ts");
const githubStorePath = join(
  import.meta.dir,
  "../../../github/store/use-github-center-tabs.ts",
);

describe("git commit center tabs", () => {
  test("are owned by git, not GitHub, and keep GitHub as an optional extra", () => {
    const store = readFileSync(storePath, "utf8");
    const github = readFileSync(githubStorePath, "utf8");
    expect(store).toContain('kind: "git-commit"');
    expect(store).toContain("GIT_COMMIT_TAB_PREFIX");
    expect(store).toContain("owner?: string | null");
    expect(store).toContain("repoPath?: string | null");
    expect(store).toContain("focusFilePath?: string | null");
    expect(github).not.toContain("github-commit");
    expect(github).not.toContain("openCommit");
  });
});
