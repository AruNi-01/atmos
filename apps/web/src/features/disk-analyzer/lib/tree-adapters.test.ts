import { describe, expect, test } from "bun:test";
import {
  filterTree,
  formatBytes,
  sortNodes,
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
    const chart = toEChartsTree(sample, sample.size);
    expect(chart.value).toBe(1000);
    const proj = chart.children?.find((c) => c.name === "proj");
    expect(proj?.isProject).toBe(true);
    expect(proj?.itemStyle?.borderWidth).toBe(2);
  });

  test("breadcrumbs", () => {
    const crumbs = breadcrumbPaths(sample, "/home/proj/src");
    expect(crumbs.map((c) => c.name)).toEqual(["home", "proj", "src"]);
  });
});
