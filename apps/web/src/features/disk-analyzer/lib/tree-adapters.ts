import type { DiskNode } from "@/api/ws/disk-analyzer-api";

export type ChartMode = "sunburst" | "treemap";

export type DiskFilters = {
  query: string;
  minSize: number;
  projectsOnly: boolean;
};

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value >= 10 || exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}

export function filterTree(node: DiskNode, filters: DiskFilters): DiskNode | null {
  const query = filters.query.trim().toLowerCase();
  const childResults = (node.children ?? [])
    .map((child) => filterTree(child, filters))
    .filter((child): child is DiskNode => child !== null);

  const nameMatch = !query || node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query);
  const sizeMatch = node.size >= filters.minSize;
  const projectMatch = !filters.projectsOnly || node.is_project || childResults.some((c) => c.is_project || hasProjectDescendant(c));

  if (filters.projectsOnly && !node.is_project && childResults.length === 0) {
    return null;
  }

  if (!sizeMatch && childResults.length === 0) {
    return null;
  }

  if (!nameMatch && childResults.length === 0) {
    return null;
  }

  if (filters.projectsOnly && !projectMatch && childResults.length === 0) {
    return null;
  }

  return {
    ...node,
    children: sortNodes(childResults, "size"),
  };
}

function hasProjectDescendant(node: DiskNode): boolean {
  if (node.is_project) return true;
  return (node.children ?? []).some(hasProjectDescendant);
}

export function sortNodes(nodes: DiskNode[], sortBy: "size" | "name"): DiskNode[] {
  const sorted = [...nodes];
  sorted.sort((a, b) => {
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    return b.size - a.size || a.name.localeCompare(b.name);
  });
  return sorted;
}

export type EChartsTreeDatum = {
  name: string;
  value: number;
  path: string;
  isProject: boolean;
  isDir: boolean;
  fileCount: number;
  dirCount: number;
  itemStyle?: { color?: string; borderColor?: string; borderWidth?: number };
  children?: EChartsTreeDatum[];
};

export function toEChartsTree(node: DiskNode, rootSize: number): EChartsTreeDatum {
  const ratio = rootSize > 0 ? node.size / rootSize : 0;
  const color = node.is_project
    ? "#0ea5e9"
    : sizeToWarmColor(ratio);

  return {
    name: node.name,
    value: Math.max(node.size, 1),
    path: node.path,
    isProject: node.is_project,
    isDir: node.is_dir,
    fileCount: node.file_count,
    dirCount: node.dir_count,
    itemStyle: node.is_project
      ? { color, borderColor: "#0369a1", borderWidth: 2 }
      : { color },
    children: (node.children ?? []).map((child) => toEChartsTree(child, rootSize)),
  };
}

function sizeToWarmColor(ratio: number): string {
  const t = Math.max(0, Math.min(1, ratio));
  // cold blue → warm red
  const r = Math.round(30 + t * 200);
  const g = Math.round(120 - t * 90);
  const b = Math.round(200 - t * 160);
  return `rgb(${r}, ${g}, ${b})`;
}

export function findNodeByPath(node: DiskNode, path: string): DiskNode | null {
  if (node.path === path) return node;
  for (const child of node.children ?? []) {
    const found = findNodeByPath(child, path);
    if (found) return found;
  }
  return null;
}

export function breadcrumbPaths(root: DiskNode, currentPath: string): DiskNode[] {
  const chain: DiskNode[] = [];
  const walk = (node: DiskNode): boolean => {
    chain.push(node);
    if (node.path === currentPath) return true;
    for (const child of node.children ?? []) {
      if (walk(child)) return true;
    }
    chain.pop();
    return false;
  };
  walk(root);
  return chain;
}
