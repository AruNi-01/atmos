import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CENTER_EXPLORER_COMMIT_LIMIT,
  CENTER_EXPLORER_SEARCH_LIMIT,
  fileRecentsFromOpenFiles,
  filterExplorerSearchEntries,
  flattenFileTreeEntries,
  isPersistableCenterFilePath,
  pathHasHiddenSegment,
  readFilesLandingSearch,
  relativeParentPath,
  writeFilesLandingSearch,
} from "@/app-shell/center-explorer-landing";
import type { FileTreeNode } from "@/api/ws-api";
import {
  CENTER_FILE_RECENTS_LIMIT,
  fileRecentsEqual,
  upsertFileRecents,
} from "@/shared/lib/center-file-recents";

function node(
  name: string,
  path: string,
  isDir: boolean,
  children?: FileTreeNode[],
): FileTreeNode {
  return {
    name,
    path,
    is_dir: isDir,
    is_symlink: false,
    is_ignored: false,
    children,
  };
}

describe("center explorer landing helpers", () => {
  test("flattens files and folders including hidden entries", () => {
    const tree = [
      node(".gitignore", "/repo/.gitignore", false),
      node(".agents", "/repo/.agents", true, [
        node("SKILL.md", "/repo/.agents/skills/SKILL.md", false),
      ]),
      node("apps", "/repo/apps", true, [
        node("web", "/repo/apps/web", true, [
          node("package.json", "/repo/apps/web/package.json", false),
        ]),
      ]),
    ];
    const entries = flattenFileTreeEntries(tree);
    expect(entries.map((entry) => entry.path)).toEqual([
      "/repo/.gitignore",
      "/repo/.agents",
      "/repo/.agents/skills/SKILL.md",
      "/repo/apps",
      "/repo/apps/web",
      "/repo/apps/web/package.json",
    ]);
    expect(entries.find((entry) => entry.path === "/repo/.agents")?.isDir).toBe(true);
  });

  test("search matches hidden files and folders by name or path", () => {
    const entries = flattenFileTreeEntries([
      node(".gitignore", "/repo/.gitignore", false),
      node(".agents", "/repo/.agents", true, [
        node("SKILL.md", "/repo/.agents/skills/atmos-audio-gen/SKILL.md", false),
      ]),
      node("README.md", "/repo/README.md", false),
    ]);
    expect(
      filterExplorerSearchEntries(entries, ".gitignore").map((entry) => entry.name),
    ).toEqual([".gitignore"]);
    expect(
      filterExplorerSearchEntries(entries, "agents").map((entry) => entry.path),
    ).toContain("/repo/.agents");
    expect(
      filterExplorerSearchEntries(entries, "atmos-audio-gen").map((entry) => entry.name),
    ).toEqual(["SKILL.md"]);
    expect(filterExplorerSearchEntries(entries, "nope")).toEqual([]);
    expect(CENTER_EXPLORER_SEARCH_LIMIT).toBe(20);
    expect(CENTER_EXPLORER_COMMIT_LIMIT).toBe(5);
  });

  test("relative parent path is the directory under the workspace root", () => {
    expect(
      relativeParentPath(
        "/repo/.agents/skills/atmos-audio-gen/SKILL.md",
        "/repo",
      ),
    ).toBe(".agents/skills/atmos-audio-gen");
    expect(relativeParentPath("/repo/README.md", "/repo")).toBe("");
    expect(relativeParentPath("/repo2/src/a.ts", "/repo")).toBe("/repo2/src");
  });

  test("detects hidden path segments", () => {
    expect(pathHasHiddenSegment("/repo/.gitignore")).toBe(true);
    expect(pathHasHiddenSegment("/repo/.agents/skills")).toBe(true);
    expect(pathHasHiddenSegment("/repo/apps/web")).toBe(false);
  });

  test("only persisted recents are regular editor files", () => {
    expect(isPersistableCenterFilePath("/repo/src/a.ts")).toBe(true);
    expect(isPersistableCenterFilePath("untitled:Untitled.md")).toBe(false);
    expect(isPersistableCenterFilePath("diff-group://unstaged")).toBe(false);
    expect(isPersistableCenterFilePath("git-conflict-resolve://merge-conflicts")).toBe(
      false,
    );
    expect(
      fileRecentsFromOpenFiles([
        { path: "/repo/a.ts", name: "a.ts", lastOpenedAt: 1, lastFocusedAt: 4 },
        { path: "untitled:Untitled.md", name: "Untitled.md", lastOpenedAt: 9, lastFocusedAt: 9 },
        {
          path: "diff-group://unstaged",
          name: "Changes",
          lastOpenedAt: 8,
          lastFocusedAt: 8,
        },
      ]),
    ).toEqual([{ path: "/repo/a.ts", name: "a.ts", openedAt: 4 }]);
  });
});

describe("center file recents", () => {
  test("keeps the newest eight files and refreshes an existing path", () => {
    const current = Array.from({ length: 8 }, (_, index) => ({
      path: `/repo/${index}.ts`,
      name: `${index}.ts`,
      openedAt: index,
    }));
    const next = upsertFileRecents(current, [
      { path: "/repo/7.ts", name: "7.ts", openedAt: 20 },
      { path: "/repo/new.ts", name: "new.ts", openedAt: 21 },
    ]);
    expect(next).toHaveLength(CENTER_FILE_RECENTS_LIMIT);
    expect(next[0]).toEqual({ path: "/repo/new.ts", name: "new.ts", openedAt: 21 });
    expect(next[1]).toEqual({ path: "/repo/7.ts", name: "7.ts", openedAt: 20 });
    expect(next.some((item) => item.path === "/repo/0.ts")).toBe(false);
    expect(
      fileRecentsEqual(next, upsertFileRecents(next, [{ path: "/repo/new.ts", name: "new.ts", openedAt: 21 }])),
    ).toBe(true);
  });
});

describe("files landing MorphingSearch persistence", () => {
  test("keeps query and open across remount for the same context", () => {
    const contextId = "files-search-persist-test";
    writeFilesLandingSearch(contextId, { query: "", open: false });
    expect(readFilesLandingSearch(contextId)).toEqual({ query: "", open: false });

    writeFilesLandingSearch(contextId, { query: "agents", open: true });
    expect(readFilesLandingSearch(contextId)).toEqual({
      query: "agents",
      open: true,
    });

    // Simulate landing remount reading the module cache.
    expect(readFilesLandingSearch(contextId)).toEqual({
      query: "agents",
      open: true,
    });

    writeFilesLandingSearch(contextId, { query: "", open: false });
    expect(readFilesLandingSearch(contextId)).toEqual({ query: "", open: false });
  });

  test("isolates search session by contextId", () => {
    writeFilesLandingSearch("ctx-a", { query: "a", open: true });
    writeFilesLandingSearch("ctx-b", { query: "b", open: false });
    expect(readFilesLandingSearch("ctx-a")).toEqual({ query: "a", open: true });
    expect(readFilesLandingSearch("ctx-b")).toEqual({ query: "b", open: false });
    writeFilesLandingSearch("ctx-a", { query: "", open: false });
    writeFilesLandingSearch("ctx-b", { query: "", open: false });
  });
});

describe("center explorer landing UI", () => {
  const source = readFileSync(
    join(import.meta.dir, "../CenterExplorerLanding.tsx"),
    "utf8",
  );

  test("files landing searches hidden entries; changes landing opens graph commits", () => {
    expect(source).toContain("searchPlaceholder");
    expect(source).toContain("useFileTreeQuery(needle ? rootPath : null, true)");
    expect(source).toContain("MorphingSearch");
    expect(source).toContain("clearOnSelect={false}");
    expect(source).toContain("readFilesLandingSearch");
    expect(source).toContain("writeFilesLandingSearch");
    expect(source).toContain("defaultQuery={initialSearch.query}");
    expect(source).toContain("setSearchOpen(false)");
    expect(source).toContain("writeFilesLandingSearch(contextId, { query, open: false })");
    // Files empty-state open replaces the landing tab (no stacked Files + file tab).
    expect(source).toContain("openFile(path, contextId, { preview: true })");
    expect(source).toContain("activateCenterChromeTab(contextId, path, { placement: \"focused\" })");
    expect(source).toContain("close(contextId, FILES_TAB_VALUE)");
    // Recent files stay visible while MorphingSearch has a query / results.
    expect(source).toContain('data-center-explorer-recents=""');
    expect(source).not.toContain("!needle && recents.length");
    expect(source).toContain("graphHistory");
    expect(source).toContain("openRecentCommit(commit.hash)");
    expect(source).toContain("tooltip={`${commit.short_hash}  ${commit.subject}`}");
    expect(source).not.toContain("openGitHistoryTab(commit.hash)");
    expect(source).toContain("requestCommitScope");
    expect(source).toContain('buildDiffGroupPath("commit")');
    expect(source).toContain("CENTER_EXPLORER_COMMIT_LIMIT");
    expect(source.match(/data-center-explorer-search/g)?.length).toBe(1);
    expect(source).toContain("data-center-explorer-chrome");
    expect(source).toContain("CENTER_EXPLORER_BODY_INSET_CLASS");
    expect(source).toContain("ChangesExplorerLanding");
    expect(source).toContain("pt-[min(18vh,7.5rem)]");
    expect(source).not.toContain("my-auto");
    expect(source).toContain("data-center-explorer-change-status-list");
    expect(source).toContain("pullRequests");
    expect(source).toContain("openPullRequestTab");
    expect(source).toContain("openChangeStatus");
    expect(source).toContain("buildDiffGroupPath");
    expect(source).toContain("requestChangesScope");
    expect(source).toContain(
      'setCenterExplorerCollapsed("changes", false, groupPath)',
    );
    expect(source).toContain("foldScopeId={kind === \"changes\" ? CHANGES_TAB_VALUE : undefined}");
    const graphIdx = source.indexOf('testId="graph-history"');
    const commitsIdx = source.indexOf('testId="recent-commit"');
    expect(graphIdx).toBeGreaterThan(commitsIdx);
  });
});
