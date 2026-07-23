import { describe, expect, test } from "bun:test";
import {
  filterTree,
  formatBytes,
  sizeToUsageColor,
  sortNodes,
  takeTopChildren,
  toEChartsTree,
  breadcrumbPaths,
  type DiskFilters,
} from "./tree-adapters";
import type { DiskNode } from "@/api/ws/disk-analyzer-api";

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

  test("echarts adapter preserves sizes and project style", () => {
    const chart = toEChartsTree(sample, sample.size, { maxDepth: 2 });
    expect(chart.value).toBe(1000);
    expect(chart.bytes).toBe(1000);
    const proj = chart.children?.find((c) => c.name === "proj");
    expect(proj?.isProject).toBe(true);
    expect(proj?.itemStyle?.borderWidth).toBe(2);
  });

  test("sizeToUsageColor maps larger shares toward warmer hues", () => {
    const small = sizeToUsageColor(0.05, 0);
    const large = sizeToUsageColor(0.9, 0);
    expect(small.startsWith("hsl(")).toBe(true);
    expect(large.startsWith("hsl(")).toBe(true);
    // Small → cool (high hue ~ cyan/blue); large → warm (low hue ~ red/orange).
    const smallHue = Number(small.match(/hsl\((\d+)/)?.[1] ?? -1);
    const largeHue = Number(large.match(/hsl\((\d+)/)?.[1] ?? -1);
    expect(smallHue).toBeGreaterThan(140);
    expect(largeHue).toBeLessThan(60);
    expect(smallHue).toBeGreaterThan(largeHue);
  });

  test("echarts adapter caps nesting depth for treemap (1) and sunburst (2)", () => {
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
    };
    // Treemap: single tile, no nested kids
    const flat = toEChartsTree(deep.children![0], 100, { maxDepth: 1 });
    expect(flat.name).toBe("L1");
    expect(flat.children).toBeUndefined();

    // Sunburst: L1 → L2, no L3
    const rings = toEChartsTree(deep.children![0], 100, { maxDepth: 2 });
    expect(rings.children?.[0]?.name).toBe("L2");
    expect(rings.children?.[0]?.children).toBeUndefined();
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
});
