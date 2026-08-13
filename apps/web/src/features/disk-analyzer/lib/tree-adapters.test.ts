import { describe, expect, test } from "bun:test";
import {
  AGENT_DATA_GROUP_PATH,
  ATMOS_OVERVIEW_PATH,
  GIT_WORKTREES_GROUP_PATH,
  breadcrumbPaths,
  buildBreadcrumbs,
  canDeleteDiskPath,
  cleanupHintMessageKey,
  collectCleanupSuggestions,
  filterTree,
  formatBytes,
  getCleanupHintKey,
  isAtmosOverviewPath,
  isAtmosRuntimeDir,
  localizeAgentSessionName,
  friendlyDiskEntryName,
  friendlyDiskEntryPath,
  isAtmosSyntheticPath,
  isChildrenLoaded,
  layoutValue,
  levelNeedsWiderTopN,
  localizedSyntheticName,
  sizeToUsageColor,
  sortNodes,
  takeTopChildren,
  toEChartsTree,
  type DiskFilters,
} from "./tree-adapters";
import type { DiskNode } from "@/api/ws/disk-analyzer-api";
import {
  isWorktreeSuggestion,
  suggestionTotalSize,
} from "@/features/disk-analyzer/components/DiskAnalyzerSuggestPanel";

const sample: DiskNode = {
  name: "home",
  path: "/home",
  size: 1000,
  is_dir: true,
  is_project: false,
  file_count: 3,
  dir_count: 2,
  children: [
    {
      name: "proj",
      path: "/home/proj",
      size: 600,
      is_dir: true,
      is_project: true,
      file_count: 1,
      dir_count: 0,
      children: [
        {
          name: "src",
          path: "/home/proj/src",
          size: 600,
          is_dir: true,
          is_project: false,
          file_count: 1,
          dir_count: 0,
          children: [],
        },
      ],
    },
    {
      name: "cache",
      path: "/home/cache",
      size: 400,
      is_dir: true,
      is_project: false,
      file_count: 2,
      dir_count: 0,
      children: [],
    },
  ],
};

describe("disk analyzer tree adapters", () => {
  test("formatBytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  test("projects-only filter keeps project branch", () => {
    const filters: DiskFilters = { query: "", minSize: 0, projectsOnly: true };
    const filtered = filterTree(sample, filters);
    expect(filtered).not.toBeNull();
    expect(filtered!.children?.some((c) => c.name === "proj")).toBe(true);
    expect(filtered!.children?.some((c) => c.name === "cache")).toBe(false);
  });

  test("min size filter", () => {
    const filters: DiskFilters = { query: "", minSize: 500, projectsOnly: false };
    const filtered = filterTree(sample, filters);
    expect(filtered!.children?.map((c) => c.name)).toEqual(["proj"]);
  });

  test("name filter keeps descendants filtered", () => {
    const filters: DiskFilters = { query: "cache", minSize: 0, projectsOnly: false };
    const filtered = filterTree(sample, filters);
    expect(filtered!.children?.map((c) => c.name)).toEqual(["cache"]);
    // Parent match must not restore unfiltered children.
    const homeOnly: DiskNode = {
      ...sample,
      name: "cache-home",
      path: "/cache-home",
      children: sample.children,
    };
    const parentMatch = filterTree(homeOnly, { query: "cache-home", minSize: 0, projectsOnly: false });
    expect(parentMatch).not.toBeNull();
    expect(parentMatch!.children).toEqual([]);
  });

  test("sort by size and name", () => {
    const bySize = sortNodes(sample.children!, "size");
    expect(bySize[0].name).toBe("proj");
    const byName = sortNodes(sample.children!, "name");
    expect(byName[0].name).toBe("cache");
  });

  test("echarts adapter preserves sizes; project uses size-based color only", () => {
    const chart = toEChartsTree(sample, sample.size, {
      maxDepth: 2,
      valueMode: "bytes-eased",
    });
    expect(chart.bytes).toBe(1000);
    // Treemap mode: value tracks real bytes (eased), not sum of children.
    expect(chart.value).toBe(layoutValue(1000));
    const proj = chart.children?.find((c) => c.name === "proj");
    expect(proj?.isProject).toBe(true);
    // No special project/workspace tile chrome — color tracks size share.
    expect(proj?.itemStyle?.borderWidth).toBeUndefined();
    expect(proj?.itemStyle?.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test("echarts adapter flags git worktree and agent data (workspace wins)", () => {
    const tree: DiskNode = {
      name: "root",
      path: "/root",
      size: 300,
      is_dir: true,
      is_project: false,
      file_count: 0,
      dir_count: 3,
      children: [
        {
          name: "feat",
          path: "/root/feat",
          size: 100,
          is_dir: true,
          is_project: false,
          is_git_worktree: true,
          file_count: 1,
          dir_count: 0,
        },
        {
          name: ".cursor",
          path: "/root/.cursor",
          size: 100,
          is_dir: true,
          is_project: false,
          is_agent_data: true,
          file_count: 1,
          dir_count: 0,
        },
        {
          name: "ws",
          path: "/root/ws",
          size: 100,
          is_dir: true,
          is_project: false,
          is_workspace: true,
          is_git_worktree: true,
          file_count: 1,
          dir_count: 0,
        },
      ],
    };
    const chart = toEChartsTree(tree, tree.size, { maxDepth: 2 });
    expect(chart.children?.find((c) => c.name === "feat")?.isGitWorktree).toBe(true);
    expect(chart.children?.find((c) => c.name === ".cursor")?.isAgentData).toBe(true);
    const ws = chart.children?.find((c) => c.name === "ws");
    expect(ws?.isWorkspace).toBe(true);
    expect(ws?.isGitWorktree).toBe(false);
  });

  test("synthetic group paths localize and cannot be deleted", () => {
    expect(isAtmosOverviewPath(ATMOS_OVERVIEW_PATH)).toBe(true);
    expect(isAtmosOverviewPath(GIT_WORKTREES_GROUP_PATH)).toBe(false);
    expect(isAtmosSyntheticPath(GIT_WORKTREES_GROUP_PATH)).toBe(true);
    expect(localizedSyntheticName(AGENT_DATA_GROUP_PATH, {
      atmosRoot: "Atmos",
      agentData: "Agent data",
      gitWorktrees: "Git worktrees",
    })).toBe("Agent data");
    const group: DiskNode = {
      name: "Git worktrees",
      path: GIT_WORKTREES_GROUP_PATH,
      size: 100,
      is_dir: true,
      is_project: false,
      is_git_worktree: true,
      file_count: 1,
      dir_count: 1,
      children: [
        {
          name: "feat",
          path: "/tmp/feat",
          size: 100,
          is_dir: true,
          is_project: false,
          is_git_worktree: true,
          file_count: 1,
          dir_count: 0,
        },
      ],
    };
    const chart = toEChartsTree(group, group.size, {
      maxDepth: 2,
      gitWorktreesLabel: "Git worktrees",
    });
    expect(chart.name).toBe("Git worktrees");
    expect(chart.isGitWorktree).toBe(true);
    expect(canDeleteDiskPath(GIT_WORKTREES_GROUP_PATH, "Git worktrees", ATMOS_OVERVIEW_PATH)).toBe(
      false,
    );
    expect(canDeleteDiskPath("/tmp/feat", "feat", ATMOS_OVERVIEW_PATH)).toBe(true);
  });

  test("cleanup hint keys cover agent sessions, not whole homes", () => {
    expect(getCleanupHintKey(".cursor", 1024)).toBeUndefined();
    expect(getCleanupHintKey(".claude", 1024)).toBeUndefined();
    expect(getCleanupHintKey("session-state", 1024)).toBeUndefined();
    expect(getCleanupHintKey("acp-events", 1024)).toBe("acp_events");
    expect(getCleanupHintKey("claude", 1024)).toBe("agent_session");
    expect(getCleanupHintKey("cursorChats", 1024)).toBe("agent_session");
  });

  test("agent session labels are product names, not directories", () => {
    const labels: Record<string, string> = {
      claude: "Claude Code sessions",
      opencode: "OpenCode sessions",
    };
    const lookup = (key: string) => labels[key];
    expect(localizeAgentSessionName("claude", lookup)).toBe("Claude Code sessions");
    expect(localizeAgentSessionName("opencode (1)", lookup)).toBe("OpenCode sessions (1)");
    expect(localizeAgentSessionName(".claude/projects", lookup)).toBe(".claude/projects");
    const chart = toEChartsTree(
      {
        name: "claude",
        path: "/home/u/.claude/projects",
        size: 50,
        is_dir: true,
        is_project: false,
        is_agent_data: true,
        file_count: 1,
        dir_count: 0,
      },
      50,
      { maxDepth: 1, localizeName: (name) => localizeAgentSessionName(name, lookup) },
    );
    expect(chart.name).toBe("Claude Code sessions");
  });

  test("percent-encoded session folders show a short decoded name", () => {
    const encoded =
      "%2FUsers%2Flurunrun%2Fown_spa%2F%E4%B8%AD%E6%96%87%E9%A1%B9%E7%9B%AE";
    expect(friendlyDiskEntryName(encoded)).toBe("中文项目");
    expect(
      friendlyDiskEntryPath(`/Users/lurunrun/.grok/sessions/${encoded}`),
    ).toBe("/Users/lurunrun/own_spa/中文项目");
    expect(friendlyDiskEntryName("src")).toBe("src");
    expect(friendlyDiskEntryPath("/Users/lurunrun/src")).toBe("/Users/lurunrun/src");
    expect(
      friendlyDiskEntryPath(
        `/Users/lurunrun/.grok/sessions/${encoded}/019fc5bb-c28c-7c73-aa3a-5d952100f71d`,
      ),
    ).toBe("/Users/lurunrun/own_spa/中文项目/019fc5bb-c28c-7c73-aa3a-5d952100f71d");
    expect(
      friendlyDiskEntryPath(
        "/Users/lurunrun/.grok/sessions/%2FUsers%2Flurunrun%2Fown_space%2FOpen Source%2Fatmos/019fc5bb-c28c-7c73-aa3a-5d952100f71d",
      ),
    ).toBe(
      "/Users/lurunrun/own_space/Open Source/atmos/019fc5bb-c28c-7c73-aa3a-5d952100f71d",
    );
    const chart = toEChartsTree(
      {
        name: encoded,
        path: `/Users/lurunrun/.grok/sessions/${encoded}`,
        size: 40,
        is_dir: true,
        is_project: false,
        file_count: 1,
        dir_count: 0,
      },
      40,
      { maxDepth: 1 },
    );
    expect(chart.name).toBe("中文项目");
  });

  test("bytes-eased keeps larger folders larger among siblings", () => {
    const a = toEChartsTree(
      {
        name: "big",
        path: "/big",
        size: 46 * 1024 ** 3,
        is_dir: true,
        is_project: false,
        file_count: 0,
        dir_count: 1,
        children: [
          {
            name: "x",
            path: "/big/x",
            size: 1,
            is_dir: false,
            is_project: false,
            file_count: 1,
            dir_count: 0,
          },
        ],
      },
      100 * 1024 ** 3,
      { maxDepth: 2, valueMode: "bytes-eased" },
    );
    const b = toEChartsTree(
      {
        name: "small",
        path: "/small",
        size: 38 * 1024 ** 3,
        is_dir: true,
        is_project: false,
        file_count: 0,
        dir_count: 2,
        children: [
          {
            name: "y",
            path: "/small/y",
            size: 20 * 1024 ** 3,
            is_dir: false,
            is_project: false,
            file_count: 1,
            dir_count: 0,
          },
          {
            name: "z",
            path: "/small/z",
            size: 18 * 1024 ** 3,
            is_dir: false,
            is_project: false,
            file_count: 1,
            dir_count: 0,
          },
        ],
      },
      100 * 1024 ** 3,
      { maxDepth: 2, valueMode: "bytes-eased" },
    );
    expect(a.value).toBeGreaterThan(b.value);
    expect(a.value).toBe(layoutValue(46 * 1024 ** 3));
    expect(b.value).toBe(layoutValue(38 * 1024 ** 3));
  });

  test("isAtmosRuntimeDir detects .atmos paths", () => {
    expect(isAtmosRuntimeDir({ name: ".atmos", path: "/Users/x/.atmos" })).toBe(true);
    expect(isAtmosRuntimeDir({ name: "workspaces", path: "/Users/x/.atmos/workspaces" })).toBe(
      false,
    );
  });

  test("sizeToUsageColor maps larger shares toward warmer hues", () => {
    const small = sizeToUsageColor(0.05, 0);
    const large = sizeToUsageColor(0.9, 0);
    expect(small).toMatch(/^#[0-9a-f]{6}$/i);
    expect(large).toMatch(/^#[0-9a-f]{6}$/i);
    // Small → cool (more blue); large → warm (more red).
    const smallRgb = hexToRgb(small);
    const largeRgb = hexToRgb(large);
    expect(smallRgb.b).toBeGreaterThan(smallRgb.r);
    expect(largeRgb.r).toBeGreaterThan(largeRgb.b);
    expect(largeRgb.r).toBeGreaterThan(smallRgb.r);
  });

  test("echarts adapter caps nesting depth for treemap (1) and sunburst (3)", () => {
    const deep: DiskNode = {
      name: "L0",
      path: "/L0",
      size: 100,
      is_dir: true,
      is_project: false,
      file_count: 0,
      dir_count: 3,
      children: [
        {
          name: "L1",
          path: "/L0/L1",
          size: 100,
          is_dir: true,
          is_project: false,
          file_count: 0,
          dir_count: 2,
          children: [
            {
              name: "L2",
              path: "/L0/L1/L2",
              size: 100,
              is_dir: true,
              is_project: false,
              file_count: 0,
              dir_count: 1,
              children: [
                {
                  name: "L3",
                  path: "/L0/L1/L2/L3",
                  size: 100,
                  is_dir: true,
                  is_project: false,
                  file_count: 0,
                  dir_count: 1,
                  children: [
                    {
                      name: "L4",
                      path: "/L0/L1/L2/L3/L4",
                      size: 100,
                      is_dir: false,
                      is_project: false,
                      file_count: 1,
                      dir_count: 0,
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    // Treemap: single tile, no nested kids
    const flat = toEChartsTree(deep.children![0], 100, { maxDepth: 1 });
    expect(flat.name).toBe("L1");
    expect(flat.children).toBeUndefined();

    // Sunburst (3 rings): L1 → L2 → L3, no L4 (drill for deeper).
    const rings = toEChartsTree(deep.children![0], 100, { maxDepth: 3 });
    expect(rings.children?.[0]?.name).toBe("L2");
    expect(rings.children?.[0]?.children?.[0]?.name).toBe("L3");
    expect(rings.children?.[0]?.children?.[0]?.children).toBeUndefined();
  });

  test("echarts adapter renames __other__", () => {
    const withOther: DiskNode = {
      ...sample,
      children: [
        {
          name: "__other__",
          path: "/home/__other__",
          size: 50,
          is_dir: true,
          is_project: false,
          file_count: 0,
          dir_count: 0,
          children: [],
        },
      ],
    };
    const chart = toEChartsTree(withOther, 50, { maxDepth: 2, otherLabel: "其他" });
    expect(chart.children?.[0]?.name).toBe("其他");
  });

  test("breadcrumbs", () => {
    const crumbs = breadcrumbPaths(sample, "/home/proj/src");
    expect(crumbs.map((c) => c.name)).toEqual(["home", "proj", "src"]);
  });

  test("buildBreadcrumbs prefers linked tree walk", () => {
    const crumbs = buildBreadcrumbs(sample, "/home/proj/src");
    expect(crumbs.map((c) => c.name)).toEqual(["home", "proj", "src"]);
  });

  test("buildBreadcrumbs keeps hierarchy when focus is only in levelCache", () => {
    // Shallow root as after a late overview refresh wiped grafted deep nodes.
    const shallowRoot: DiskNode = {
      name: "Atmos",
      path: "atmos://disk-usage",
      size: 1000,
      is_dir: true,
      is_project: false,
      file_count: 0,
      dir_count: 1,
      children: [
        {
          name: "proj",
          path: "/home/proj",
          size: 600,
          is_dir: true,
          is_project: true,
          file_count: 0,
          dir_count: 1,
          children: [],
          children_loaded: false,
        },
      ],
    };
    const levelCache: Record<string, DiskNode> = {
      "/home/proj": {
        name: "proj",
        path: "/home/proj",
        size: 600,
        is_dir: true,
        is_project: true,
        file_count: 1,
        dir_count: 1,
        children_loaded: true,
        children: [
          {
            name: "src",
            path: "/home/proj/src",
            size: 400,
            is_dir: true,
            is_project: false,
            file_count: 1,
            dir_count: 0,
            children: [],
          },
        ],
      },
      "/home/proj/src": {
        name: "src",
        path: "/home/proj/src",
        size: 400,
        is_dir: true,
        is_project: false,
        file_count: 1,
        dir_count: 0,
        children_loaded: true,
        children: [
          {
            name: "main.rs",
            path: "/home/proj/src/main.rs",
            size: 12,
            is_dir: false,
            is_project: false,
            file_count: 0,
            dir_count: 0,
            children: [],
          },
        ],
      },
    };

    // Tree walk cannot reach /home/proj/src (not linked under shallow root).
    expect(breadcrumbPaths(shallowRoot, "/home/proj/src")).toEqual([]);

    const crumbs = buildBreadcrumbs(shallowRoot, "/home/proj/src", levelCache);
    expect(crumbs.map((c) => c.path)).toEqual([
      "atmos://disk-usage",
      "/home/proj",
      "/home/proj/src",
    ]);
  });

  test("buildBreadcrumbs does not collapse to root while deep focus is loading", () => {
    const shallowRoot: DiskNode = {
      ...sample,
      children: sample.children?.map((c) =>
        c.path === "/home/proj" ? { ...c, children: [] } : c,
      ),
    };
    const levelCache: Record<string, DiskNode> = {
      "/home/proj": {
        name: "proj",
        path: "/home/proj",
        size: 600,
        is_dir: true,
        is_project: true,
        file_count: 1,
        dir_count: 1,
        children_loaded: true,
        children: [],
      },
    };
    const crumbs = buildBreadcrumbs(shallowRoot, "/home/proj/src", levelCache);
    expect(crumbs.map((c) => c.path)).toEqual(["/home", "/home/proj", "/home/proj/src"]);
  });

  test("takeTopChildren collapses remainder", () => {
    const wide: DiskNode = {
      ...sample,
      children: Array.from({ length: 5 }, (_, i) => ({
        name: `c${i}`,
        path: `/home/c${i}`,
        size: (5 - i) * 100,
        is_dir: false,
        is_project: false,
        file_count: 0,
        dir_count: 0,
        children: [],
      })),
    };
    const limited = takeTopChildren(wide, 2);
    expect(limited.children?.length).toBe(3);
    expect(limited.children?.[0]?.name).toBe("c0");
    expect(limited.children?.filter((c) => c.name === "__other__").length).toBe(1);
  });

  test("levelNeedsWiderTopN is true only when __other__ hides extra children", () => {
    const pruned: DiskNode = {
      ...sample,
      children: [
        {
          name: "a",
          path: "/home/a",
          size: 100,
          is_dir: false,
          is_project: false,
          file_count: 1,
          dir_count: 0,
          children: [],
        },
        {
          name: "__other__",
          path: "/home/__other__",
          size: 50,
          is_dir: true,
          is_project: false,
          file_count: 2,
          dir_count: 0,
          children: [],
        },
      ],
    };
    expect(levelNeedsWiderTopN(pruned, 10)).toBe(true);
    expect(levelNeedsWiderTopN(pruned, 1)).toBe(false);
    expect(levelNeedsWiderTopN(sample, 100)).toBe(false);
    expect(levelNeedsWiderTopN(null, 50)).toBe(false);
  });

  test("sortNodes keeps __other__ last even when largest", () => {
    const nodes: DiskNode[] = [
      {
        name: "__other__",
        path: "/r/__other__",
        size: 9000,
        is_dir: true,
        is_project: false,
        file_count: 0,
        dir_count: 0,
        children: [],
      },
      {
        name: "app",
        path: "/r/app",
        size: 100,
        is_dir: true,
        is_project: false,
        file_count: 0,
        dir_count: 0,
        children: [],
      },
    ];
    expect(sortNodes(nodes, "size").map((n) => n.name)).toEqual(["app", "__other__"]);
  });

  test("takeTopChildren preserveZeroSizeDirs keeps pending dirs out of __other__", () => {
    const midScan: DiskNode = {
      ...sample,
      children: [
        {
          name: "cursor",
          path: "/home/.cursor",
          size: 500,
          is_dir: true,
          is_project: false,
          file_count: 1,
          dir_count: 0,
          children: [],
        },
        {
          name: "Library",
          path: "/home/Library",
          size: 0,
          is_dir: true,
          is_project: false,
          file_count: 0,
          dir_count: 0,
          children: [],
        },
        {
          name: "own_space",
          path: "/home/own_space",
          size: 0,
          is_dir: true,
          is_project: false,
          file_count: 0,
          dir_count: 0,
          children: [],
        },
        {
          name: "tiny",
          path: "/home/tiny",
          size: 10,
          is_dir: true,
          is_project: false,
          file_count: 0,
          dir_count: 0,
          children: [],
        },
      ],
    };
    const limited = takeTopChildren(midScan, 1, { preserveZeroSizeDirs: true });
    const names = limited.children?.map((c) => c.name) ?? [];
    expect(names).toContain("cursor");
    expect(names).toContain("Library");
    expect(names).toContain("own_space");
    // zeros must not be swallowed solely into __other__
    expect(names.filter((n) => n === "Library").length).toBe(1);
  });

  test("takeTopChildren merges existing server __other__", () => {
    const withOther: DiskNode = {
      ...sample,
      path: "/Applications",
      children: [
        {
          name: "A",
          path: "/Applications/A",
          size: 300,
          is_dir: true,
          is_project: false,
          file_count: 1,
          dir_count: 0,
          children: [],
        },
        {
          name: "B",
          path: "/Applications/B",
          size: 200,
          is_dir: true,
          is_project: false,
          file_count: 1,
          dir_count: 0,
          children: [],
        },
        {
          name: "C",
          path: "/Applications/C",
          size: 100,
          is_dir: true,
          is_project: false,
          file_count: 1,
          dir_count: 0,
          children: [],
        },
        {
          name: "__other__",
          path: "/Applications/__other__",
          size: 50,
          is_dir: true,
          is_project: false,
          file_count: 2,
          dir_count: 1,
          children_loaded: true,
          children: [],
        },
      ],
    };
    const limited = takeTopChildren(withOther, 2);
    const others = limited.children?.filter((c) => c.name === "__other__") ?? [];
    expect(others.length).toBe(1);
    expect(others[0].path).toBe("/Applications/__other__");
    // C (100) + existing other (50)
    expect(others[0].size).toBe(150);
    expect(limited.children?.map((c) => c.name)).toEqual(["A", "B", "__other__"]);
  });

  test("layoutValue compresses large sizes relative to small ones", () => {
    const big = layoutValue(45 * 1024 ** 3);
    const small = layoutValue(560 * 1024 ** 2);
    // Linear ratio is ~80:1; eased ratio should be much smaller so small tiles remain visible.
    expect(big / small).toBeLessThan(20);
    expect(big).toBeGreaterThan(small);
  });

  test("toEChartsTree stores real bytes and eased layout value", () => {
    const node: DiskNode = {
      name: "x",
      path: "/x",
      size: 1024 ** 3,
      is_dir: true,
      is_project: false,
      file_count: 0,
      dir_count: 0,
      children: [],
    };
    const datum = toEChartsTree(node, 1024 ** 3, { maxDepth: 1 });
    expect(datum.bytes).toBe(1024 ** 3);
    expect(datum.value).toBe(layoutValue(1024 ** 3));
    expect(datum.value).not.toBe(datum.bytes);
  });

  test("toEChartsTree hierarchical parent value equals sum of children (sunburst)", () => {
    const node: DiskNode = {
      name: "root",
      path: "/root",
      size: 1000,
      is_dir: true,
      is_project: false,
      file_count: 0,
      dir_count: 2,
      children: [
        {
          name: "big",
          path: "/root/big",
          size: 800,
          is_dir: true,
          is_project: false,
          file_count: 0,
          dir_count: 0,
          children: [
            {
              name: "leaf-a",
              path: "/root/big/a",
              size: 500,
              is_dir: false,
              is_project: false,
              file_count: 1,
              dir_count: 0,
            },
            {
              name: "leaf-b",
              path: "/root/big/b",
              size: 300,
              is_dir: false,
              is_project: false,
              file_count: 1,
              dir_count: 0,
            },
          ],
        },
        {
          name: "small",
          path: "/root/small",
          size: 200,
          is_dir: false,
          is_project: false,
          file_count: 1,
          dir_count: 0,
        },
      ],
    };
    const datum = toEChartsTree(node, 1000, {
      maxDepth: 3,
      valueMode: "hierarchical",
    });
    const big = datum.children?.find((c) => c.name === "big");
    const small = datum.children?.find((c) => c.name === "small");
    expect(big).toBeTruthy();
    expect(small).toBeTruthy();
    // Leaves keep layoutValue; parents sum children (not layoutValue(parent bytes)).
    const leafSum = (big!.children ?? []).reduce(
      (s, c) => s + (typeof c.value === "number" ? c.value : 0),
      0,
    );
    expect(big!.value).toBe(leafSum);
    expect(big!.value).not.toBe(layoutValue(800));
    expect(small!.value).toBe(layoutValue(200));
    expect(datum.value).toBe(
      (typeof big!.value === "number" ? big!.value : 0) +
        (typeof small!.value === "number" ? small!.value : 0),
    );
  });

  test("isChildrenLoaded treats du measure shells as unloaded", () => {
    const shell: DiskNode = {
      name: ".atmos",
      path: "/Users/x/.atmos",
      size: 45 * 1024 ** 3,
      is_dir: true,
      is_project: false,
      file_count: 0,
      dir_count: 0,
      children_loaded: true,
      children: [],
    };
    expect(isChildrenLoaded(shell)).toBe(false);

    const loadedEmpty: DiskNode = {
      name: "empty",
      path: "/empty",
      size: 0,
      is_dir: true,
      is_project: false,
      file_count: 0,
      dir_count: 0,
      children_loaded: true,
      children: [],
    };
    expect(isChildrenLoaded(loadedEmpty)).toBe(true);
  });

  test("getCleanupHintKey maps basenames to i18n-safe keys", () => {
    expect(cleanupHintMessageKey(".next")).toBe("dot_next");
    expect(cleanupHintMessageKey("_build")).toBe("under_build");
    expect(cleanupHintMessageKey("__pycache__")).toBe("pycache");
    expect(getCleanupHintKey("node_modules", 100)).toBe("node_modules");
    expect(getCleanupHintKey(".next", 100)).toBe("dot_next");
    expect(getCleanupHintKey("src", 100)).toBeUndefined();
    expect(getCleanupHintKey("build", 100)).toBeUndefined();
    expect(getCleanupHintKey("dist", 100)).toBeUndefined();
    expect(getCleanupHintKey("out", 100)).toBeUndefined();
    expect(getCleanupHintKey("output", 100)).toBeUndefined();
    expect(getCleanupHintKey("tmp", 100)).toBeUndefined();
    expect(getCleanupHintKey("node_modules", 0)).toBeUndefined();
  });

  test("collectCleanupSuggestions only checks visible immediate children", () => {
    const children: DiskNode[] = [
      {
        name: "node_modules",
        path: "/proj/node_modules",
        size: 80,
        is_dir: true,
        is_project: false,
        file_count: 1,
        dir_count: 0,
        children: [],
      },
      {
        name: "src",
        path: "/proj/src",
        size: 20,
        is_dir: true,
        is_project: false,
        file_count: 1,
        dir_count: 0,
        children: [
          {
            name: "target",
            path: "/proj/src/target",
            size: 10,
            is_dir: true,
            is_project: false,
            file_count: 0,
            dir_count: 0,
            children: [],
          },
        ],
      },
      {
        name: "target",
        path: "/proj/target",
        size: 50,
        is_dir: true,
        is_project: false,
        file_count: 0,
        dir_count: 0,
        children: [],
      },
    ];
    // Only top-level visible tiles — nested src/target is ignored.
    const tips = collectCleanupSuggestions(children);
    expect(tips.map((t) => t.name).sort()).toEqual(["node_modules", "target"]);
    expect(tips.every((t) => t.path.startsWith("/proj/") && !t.path.includes("/src/"))).toBe(
      true,
    );
    // When user drills into src, only that level's children matter.
    const srcLevel = collectCleanupSuggestions(children[1].children);
    expect(srcLevel.map((t) => t.name)).toEqual(["target"]);
  });
});

describe("disk analyzer suggestion helpers", () => {
  test("worktree kinds are treated as git removals", () => {
    expect(
      isWorktreeSuggestion({
        path: "/wt",
        name: "wt",
        size: 1,
        reason: "",
        kind: "worktree",
      }),
    ).toBe(true);
    expect(
      isWorktreeSuggestion({
        path: "/ws",
        name: "ws",
        size: 1,
        reason: "",
        kind: "workspace",
      }),
    ).toBe(true);
    expect(
      isWorktreeSuggestion({
        path: "/nm",
        name: "node_modules",
        size: 1,
        reason: "",
        kind: "cache",
      }),
    ).toBe(false);
  });

  test("suggestionTotalSize sums card sizes", () => {
    expect(
      suggestionTotalSize([
        { path: "/a", name: "a", size: 10, reason: "" },
        { path: "/b", name: "b", size: 25, reason: "" },
      ]),
    ).toBe(35);
  });
});

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
