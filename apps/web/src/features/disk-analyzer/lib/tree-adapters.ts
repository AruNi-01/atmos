import type { DiskNode } from "@/api/ws/disk-analyzer-api";

export type ChartMode = "sunburst" | "treemap";

export type DiskFilters = {
  query: string;
  minSize: number;
  projectsOnly: boolean;
};

export const DEFAULT_TOP_N = 30;
export const TOP_N_OPTIONS = [10, 20, 30, 50, 100] as const;
/** Treemap: only the focused folder's immediate children (flat tiles). */
export const TREEMAP_CHART_DEPTH = 1;
/** Sunburst: focused children + one more ring. */
export const SUNBURST_CHART_DEPTH = 2;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value >= 10 || exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}

const OTHER_NAME = "__other__";

function isOtherNode(node: DiskNode): boolean {
  return node.name === OTHER_NAME;
}

function otherPathFor(parentPath: string): string {
  return `${parentPath.replace(/\/$/, "")}/${OTHER_NAME}`;
}

export type TakeTopOptions = {
  /** Nesting levels to keep under this node (default: sunburst depth). */
  maxDepth?: number;
  /**
   * While a scan is still running, never collapse zero-size dirs into `__other__`.
   * Those siblings are still being walked (e.g. Library) and must stay listed.
   */
  preserveZeroSizeDirs?: boolean;
};

/**
 * Keep top-N real children by size; collapse remainder (+ any existing `__other__`) into one.
 * Recurses only `maxDepth` levels under this node (default 2 — enough for sunburst).
 */
export function takeTopChildren(
  node: DiskNode,
  topN: number,
  maxDepthOrOptions: number | TakeTopOptions = SUNBURST_CHART_DEPTH,
): DiskNode {
  const options: TakeTopOptions =
    typeof maxDepthOrOptions === "number"
      ? { maxDepth: maxDepthOrOptions }
      : maxDepthOrOptions;
  const maxDepth = options.maxDepth ?? SUNBURST_CHART_DEPTH;
  const preserveZero = options.preserveZeroSizeDirs === true;
  const n = Math.max(1, topN);
  const raw = node.children ?? [];
  // Server prune + client re-prune can both emit `__other__` — merge to a single synthetic node.
  const existingOthers = raw.filter(isOtherNode);
  const real = sortNodes(
    raw.filter((c) => !isOtherNode(c)),
    "size",
  ).map((child) => {
    // Apply top-N recursively so nested sunburst rings stay bounded.
    if (maxDepth > 1 && child.is_dir && (child.children?.length ?? 0) > 0) {
      return takeTopChildren(child, n, {
        maxDepth: maxDepth - 1,
        preserveZeroSizeDirs: preserveZero,
      });
    }
    // At the depth cap, drop nested children so charts stay shallow.
    if ((child.children?.length ?? 0) > 0) {
      return { ...child, children: [] };
    }
    return child;
  });

  if (real.length <= n && existingOthers.length <= 1) {
    const children =
      existingOthers.length === 0
        ? real
        : [
            ...real,
            {
              ...existingOthers[0],
              path: otherPathFor(node.path),
              name: OTHER_NAME,
            },
          ];
    return { ...node, children: sortNodes(children, "size") };
  }

  const sized = real.filter((c) => c.size > 0);
  const zeroDirs = preserveZero
    ? real.filter((c) => c.size <= 0 && c.is_dir)
    : [];
  const zeroOther = preserveZero
    ? real.filter((c) => c.size <= 0 && !c.is_dir)
    : real.filter((c) => c.size <= 0);

  // Prefer non-zero entries for the top-N slots.
  const keptSized = sized.slice(0, n);
  const slotsLeft = Math.max(0, n - keptSized.length);
  const keptZero = preserveZero ? zeroDirs : zeroOther.slice(0, slotsLeft);
  const kept = [...keptSized, ...keptZero];
  const keptPaths = new Set(kept.map((c) => c.path));
  const rest = real.filter((c) => !keptPaths.has(c.path));
  // While scanning, do not merge still-zero dirs into Other — they are in-flight.
  const collapsed = preserveZero
    ? [...rest.filter((c) => c.size > 0), ...existingOthers]
    : [...rest, ...existingOthers];

  if (collapsed.length === 0) {
    return { ...node, children: sortNodes(kept, "size") };
  }

  const otherSize = collapsed.reduce((sum, c) => sum + c.size, 0);
  const otherFiles = collapsed.reduce((sum, c) => {
    if (isOtherNode(c)) return sum + c.file_count;
    return sum + c.file_count + (c.is_dir ? 0 : 1);
  }, 0);
  const otherDirs = collapsed.reduce((sum, c) => {
    if (isOtherNode(c)) return sum + c.dir_count;
    return sum + (c.is_dir ? 1 + c.dir_count : 0);
  }, 0);

  // Pending zero-size dirs stay as individual rows so the list can grow into Mole-like top30.
  const pendingZeros = preserveZero ? zeroDirs.filter((c) => !keptPaths.has(c.path)) : [];

  return {
    ...node,
    children: sortNodes(
      [
        ...kept,
        ...pendingZeros,
        {
          name: OTHER_NAME,
          path: otherPathFor(node.path),
          size: otherSize,
          is_dir: true,
          is_project: false,
          file_count: otherFiles,
          dir_count: otherDirs,
          children_loaded: true,
          children: [],
        },
      ],
      "size",
    ),
  };
}

export function isChildrenLoaded(node: DiskNode): boolean {
  if (!node.is_dir) return true;
  if (node.name === "__other__") return true;
  return node.children_loaded !== false;
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
    // Synthetic remainder bucket always last in "Largest items" / charts.
    const aOther = a.name === OTHER_NAME;
    const bOther = b.name === OTHER_NAME;
    if (aOther !== bOther) return aOther ? 1 : -1;
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
  /** Original byte size (ECharts may rewrite `value` for layout). */
  bytes: number;
  path: string;
  isProject: boolean;
  isDir: boolean;
  fileCount: number;
  dirCount: number;
  itemStyle?: { color?: string; borderColor?: string; borderWidth?: number };
  children?: EChartsTreeDatum[];
};

export type ToEChartsTreeOptions = {
  /** Levels of nesting under this node to include (1 = this node only, no kids). */
  maxDepth?: number;
  /** Display label for synthetic `__other__` buckets. */
  otherLabel?: string;
};

/**
 * Convert a disk node into ECharts treemap/sunburst data.
 * Depth is capped so progressive full trees don't paint hundreds of nested micro-tiles.
 */
export function toEChartsTree(
  node: DiskNode,
  rootSize: number,
  options: ToEChartsTreeOptions = {},
  depth = 0,
  /** Sibling index — slight hue jitter so equal-sized peers stay distinct. */
  siblingIndex = 0,
): EChartsTreeDatum {
  const maxDepth = options.maxDepth ?? TREEMAP_CHART_DEPTH;
  const otherLabel = options.otherLabel ?? "Other";
  const ratio = rootSize > 0 ? node.size / rootSize : 0;
  const isOther = node.name === OTHER_NAME;
  const color = isOther
    ? "hsl(220 8% 42%)"
    : node.is_project
      ? "#38bdf8"
      : sizeToUsageColor(ratio, siblingIndex);
  const displayName = isOther ? otherLabel : node.name;
  const bytes = Math.max(node.size, 0);

  // At max depth, stop nesting — size still represents the whole subtree.
  const nestFurther = depth < maxDepth - 1;
  const childNodes = nestFurther ? (node.children ?? []) : [];

  return {
    name: displayName,
    value: Math.max(bytes, 1),
    bytes,
    path: node.path,
    isProject: node.is_project,
    isDir: node.is_dir,
    fileCount: node.file_count,
    dirCount: node.dir_count,
    // Hex/hsl only — ECharts canvas does not reliably parse oklch and falls back to black.
    itemStyle: node.is_project
      ? { color, borderColor: "#7dd3fc", borderWidth: 2 }
      : { color },
    children:
      childNodes.length > 0
        ? childNodes.map((child, i) =>
            toEChartsTree(child, rootSize, options, depth + 1, i),
          )
        : undefined,
  };
}

/**
 * Multi-hue scale by share of chart root: cool/small → warm/large
 * (cyan → green → yellow → orange → red), similar to disk-usage maps in ECharts demos.
 */
export function sizeToUsageColor(ratio: number, siblingIndex = 0): string {
  // Ease mid-range so mid-sized folders still get distinct hues.
  const t = Math.max(0, Math.min(1, Math.pow(ratio, 0.55)));
  // Spread peers by a few degrees so equal ratios don't paint as one mud color.
  const jitter = siblingIndex === 0 ? 0 : ((siblingIndex * 23) % 25) - 12;

  // Continuous hue: 205° cyan-blue (tiny) → 0° red (largest).
  const hue = (205 * (1 - t) + jitter + 360) % 360;
  const sat = 58 + t * 28; // 58–86%
  const light = 54 - t * 12; // 54–42% — readable on dark chrome
  return `hsl(${Math.round(hue)} ${Math.round(sat)}% ${Math.round(light)}%)`;
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
