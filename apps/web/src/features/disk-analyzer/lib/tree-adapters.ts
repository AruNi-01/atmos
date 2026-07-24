import type { CleanupSuggestion, DiskNode } from "@/api/ws/disk-analyzer-api";

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
/**
 * Sunburst: up to 3 rings from the focused folder
 * (immediate children + two nested levels). Drill in to load deeper paths.
 */
export const SUNBURST_CHART_DEPTH = 3;

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
          is_workspace: false,
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
  if (node.name === OTHER_NAME) return true;
  if (node.children_loaded === false) return false;
  // Overview shells measured with `du` often arrive as size>0, empty children,
  // and (wrongly) children_loaded=true after depth cap. Treat as unloaded so
  // drill-in still requests scan_level.
  if ((node.children?.length ?? 0) === 0 && node.size > 0) {
    return false;
  }
  return true;
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

/** Build-artifact / cache dirs users expect to see first (Mole-style hotspots). */
const HOTSPOT_NAMES = new Set([
  "node_modules",
  "target",
  ".next",
  ".nuxt",
  ".output",
  "dist",
  "build",
  ".cache",
  "out",
  "__pycache__",
  ".venv",
  "venv",
  ".gradle",
  ".m2",
  "Pods",
  "DerivedData",
  ".dart_tool",
  "coverage",
  ".turbo",
  ".parcel-cache",
  "workspaces",
  "zig-cache",
  "_build",
  ".terraform",
]);

function hotspotRank(name: string): number {
  return HOTSPOT_NAMES.has(name) ? 0 : 1;
}

/**
 * Basename → reason for cleanup chips (aligned with core-engine CLEANUP_HINTS).
 * Keys are lowercased; matching is case-insensitive.
 */
const CLEANUP_HINTS: Record<string, string> = {
  node_modules: "Node.js dependencies (reinstall with npm/pnpm/yarn)",
  ".npm": "npm cache",
  ".pnpm-store": "pnpm content-addressable store",
  ".yarn": "Yarn cache / releases",
  ".yarn-cache": "Yarn classic cache",
  bower_components: "Bower packages (legacy)",
  ".next": "Next.js build output",
  ".nuxt": "Nuxt build output",
  ".output": "Nuxt/Nitro/framework output",
  ".vercel": "Vercel build cache",
  ".turbo": "Turborepo remote/local cache",
  ".svelte-kit": "SvelteKit build output",
  ".angular": "Angular CLI cache",
  ".vite": "Vite prebundle cache",
  ".webpack": "Webpack cache",
  ".parcel-cache": "Parcel bundler cache",
  ".eslintcache": "ESLint cache",
  ".stylelintcache": "Stylelint cache",
  "storybook-static": "Storybook static build",
  ".docusaurus": "Docusaurus build cache",
  ".astro": "Astro build cache",
  coverage: "Test coverage reports",
  ".nyc_output": "Istanbul/nyc coverage temp",
  ".jest": "Jest cache",
  ".vitest": "Vitest cache",
  ".swc": "SWC compiler cache",
  ".nx": "Nx computation cache",
  dist: "Build distribution output",
  build: "Build output (Gradle/CMake/web/etc.)",
  out: "Compile/export output",
  output: "Generic build output",
  ".cache": "Tool cache directory",
  ".tmp": "Temporary build files",
  ".temp": "Temporary build files",
  tmp: "Temporary files (project-local)",
  target: "Rust/Cargo or sbt/Scala build artifacts",
  __pycache__: "Python bytecode cache",
  ".pytest_cache": "pytest cache",
  ".mypy_cache": "mypy type-check cache",
  ".ruff_cache": "Ruff linter cache",
  ".tox": "tox virtualenvs",
  ".nox": "nox virtualenvs",
  ".venv": "Python virtual environment",
  venv: "Python virtual environment",
  ".virtualenv": "virtualenv directory",
  ".pdm-cache": "PDM package cache",
  ".ipynb_checkpoints": "Jupyter notebook checkpoints",
  htmlcov: "coverage.py HTML report",
  ".eggs": "Python eggs",
  ".gradle": "Gradle cache",
  ".m2": "Maven local repository",
  ".ivy2": "Ivy dependency cache",
  ".kotlin": "Kotlin compiler daemon/cache",
  // Note: do not flag `vendor` — often real/patched project deps (Go/PHP).
  cmakefiles: "CMake generated files",
  "cmake-build-debug": "CLion/CMake debug build",
  "cmake-build-release": "CLion/CMake release build",
  ".cxx": "Android NDK / CMake CXX cache",
  deriveddata: "Xcode DerivedData",
  pods: "CocoaPods dependencies",
  ".build": "SwiftPM / generic dot-build output",
  carthage: "Carthage checkouts/build",
  xcuserdata: "Xcode per-user data",
  ".swiftpm": "Swift Package Manager cache",
  ".externalnativebuild": "Android NDK external build",
  ".dart_tool": "Dart/Flutter tool cache",
  ".pub-cache": "Pub global package cache",
  ephemeral: "Flutter ephemeral generated files",
  obj: ".NET intermediate build objects",
  ".nuget": "NuGet package cache",
  testresults: ".NET / VS test results",
  ".bundle": "Bundler cache/config",
  ".sass-cache": "Sass cache",
  _build: "Mix/Elixir or Dune/OCaml build",
  deps: "Mix dependencies",
  ".elixir_ls": "ElixirLS cache",
  ".stack-work": "Stack work directory",
  "dist-newstyle": "Cabal new-style build",
  ".bloop": "Bloop BSP cache",
  ".metals": "Metals language server cache",
  "zig-cache": "Zig build cache",
  "zig-out": "Zig build output",
  nimcache: "Nim compiler cache",
  ".opam": "opam root / package cache",
  ".terraform": "Terraform providers and modules",
  ".terragrunt-cache": "Terragrunt download cache",
  ".pulumi": "Pulumi plugins/cache",
  ".serverless": "Serverless Framework package",
  ".aws-sam": "AWS SAM build artifacts",
  "cdk.out": "AWS CDK cloud assembly",
  ".vagrant": "Vagrant machine data",
  intermediate: "Unreal Engine intermediate",
  binaries: "Unreal Engine binaries",
  deriveddatacache: "Unreal derived data cache",
  "bazel-bin": "Bazel bin outputs",
  "bazel-out": "Bazel output tree",
  "buck-out": "Buck build output",
  ".direnv": "direnv layout cache",
  ".devenv": "devenv cache",
  ".ollama": "Ollama local models",
  ".huggingface": "Hugging Face hub cache",
  huggingface: "Hugging Face cache",
  ".torch": "PyTorch hub cache",
  ".keras": "Keras datasets/models",
  "ms-playwright": "Playwright browser binaries",
  puppeteer: "Puppeteer Chromium",
  ".playwright": "Playwright cache",
  "playwright-report": "Playwright HTML report",
  "test-results": "E2E/test artifacts",
  _site: "Jekyll / static site output",
  ".vuepress": "VuePress cache/dist",
  ".vscode-test": "VS Code extension test host",
};

/**
 * JSON-safe message key under `DiskAnalyzer.cleanupHints.*`.
 * Leading dots become `dot_`; leading underscores become `under_` to avoid collisions.
 */
export function cleanupHintMessageKey(basename: string): string {
  const lower = basename.toLowerCase();
  if (lower.startsWith("_") && !lower.startsWith("__")) {
    return `under_${lower
      .slice(1)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")}`;
  }
  return (
    lower
      .replace(/^__+/, "")
      .replace(/__+$/, "")
      .replace(/^\./, "dot_")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "default"
  );
}

/**
 * i18n key for a cleanup-candidate basename (under DiskAnalyzer.cleanupHints), if any.
 * Use with `t(\`cleanupHints.${key}\`)` — never show English reason strings in UI.
 */
export function getCleanupHintKey(name: string, size: number): string | undefined {
  if (size <= 0) return undefined;
  const key = name.toLowerCase();
  if (CLEANUP_HINTS[key]) return cleanupHintMessageKey(key);
  if (name.endsWith(".egg-info")) return "egg_info";
  if (name.endsWith(".tsbuildinfo") && size > 1024) return "tsbuildinfo";
  return undefined;
}

/**
 * English reason text (for non-UI payloads / tests). Prefer `getCleanupHintKey` + i18n in React.
 */
export function getCleanupReason(name: string, size: number): string | undefined {
  if (size <= 0) return undefined;
  const key = name.toLowerCase();
  if (CLEANUP_HINTS[key]) return CLEANUP_HINTS[key];
  if (name.endsWith(".egg-info")) return "Python package egg-info (rebuildable)";
  if (name.endsWith(".tsbuildinfo") && size > 1024) {
    return "TypeScript incremental build info";
  }
  return undefined;
}

/**
 * Cleanup tips for **tiles currently shown** at this level only.
 *
 * Only inspects immediate children (same set as the treemap / child list) —
 * does **not** recurse into nested folders. Call again when the user drills.
 */
export function collectCleanupSuggestions(
  /** Nodes visible at the current chart level (e.g. childList / focused children). */
  visibleChildren: DiskNode[] | null | undefined,
  limit = 40,
): CleanupSuggestion[] {
  if (!visibleChildren?.length) return [];
  const out: CleanupSuggestion[] = [];

  for (const child of visibleChildren) {
    if (child.name === OTHER_NAME) continue;
    const reason = getCleanupReason(child.name, child.size);
    if (!reason) continue;
    out.push({
      path: child.path,
      name: child.name,
      size: child.size,
      reason,
    });
  }

  out.sort((a, b) => b.size - a.size || a.path.localeCompare(b.path));
  return out.slice(0, limit);
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
    // Prefer known heavy dirs among similar sizes so they don't fall into `__other__`.
    const hot = hotspotRank(a.name) - hotspotRank(b.name);
    if (hot !== 0) return hot;
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
  isWorkspace: boolean;
  /** Basename/path is `~/.atmos` runtime data dir. */
  isAtmosRuntime: boolean;
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
  /**
   * How ECharts `value` (area / angle) is derived:
   * - `bytes-eased` (treemap): always layoutValue(real bytes) — **monotone in size**
   *   so 46GB is always larger than 38GB among siblings, while still compressing extremes.
   * - `hierarchical` (sunburst): parents = sum(children) so wedges stay nested.
   */
  valueMode?: "bytes-eased" | "hierarchical";
};

/**
 * Layout-only size ease for chart area/angle.
 * Values &lt; 1 compress huge vs tiny so one folder can't erase the rest,
 * but the function is **strictly increasing** so larger bytes ⇒ larger layout value.
 * Tooltip/labels still use real `bytes`.
 */
export const LAYOUT_SIZE_EXPONENT = 0.55;

/** Map real byte size → ECharts layout value (area). Monotone in bytes. */
export function layoutValue(bytes: number): number {
  const b = Math.max(bytes, 0);
  if (b <= 0) return 1;
  return Math.max(Math.pow(b, LAYOUT_SIZE_EXPONENT), 1);
}

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
  const valueMode = options.valueMode ?? "bytes-eased";
  const ratio = rootSize > 0 ? node.size / rootSize : 0;
  const isOther = node.name === OTHER_NAME;
  const isAtmosRuntime = isAtmosRuntimeDir(node);
  const isWorkspace = !isAtmosRuntime && node.is_workspace === true;
  const isProject = !isAtmosRuntime && node.is_project === true && !isWorkspace;
  // Always size-based hues so a folder full of workspaces still shows relative weight.
  // Kind identity is shown as chips in Details / tooltip, not tile color.
  // Prefer #rrggbb — canvas emphasis/repaint can drop hsl() to black.
  const color = isOther
    ? "#636b78"
    : sizeToUsageColor(ratio, siblingIndex);
  const displayName = isOther ? otherLabel : node.name;
  const bytes = Math.max(node.size, 0);

  // At max depth, stop nesting — size still represents the whole subtree.
  const nestFurther = depth < maxDepth - 1;
  const childNodes = nestFurther ? (node.children ?? []) : [];

  const children =
    childNodes.length > 0
      ? childNodes.map((child, i) =>
          toEChartsTree(child, rootSize, options, depth + 1, i),
        )
      : undefined;

  const eased = layoutValue(bytes);
  // Treemap must use real-size ease at every node so sibling order matches bytes.
  // Sunburst parents must sum children so outer rings stay inside the parent wedge
  // (sum of eased children ≠ ease(parent) when exponent < 1).
  let value = eased;
  if (
    valueMode === "hierarchical" &&
    children &&
    children.length > 0
  ) {
    value = children.reduce(
      (sum, c) => sum + (typeof c.value === "number" ? c.value : 0),
      0,
    );
  }

  return {
    name: displayName,
    value: Math.max(value, 1),
    bytes,
    path: node.path,
    isProject,
    isWorkspace,
    isAtmosRuntime,
    isDir: node.is_dir,
    fileCount: node.file_count,
    dirCount: node.dir_count,
    // Hex only — ECharts canvas does not reliably parse oklch/hsl on state paint.
    itemStyle: { color },
    children,
  };
}

/** `~/.atmos` (or any path whose basename is `.atmos`) — Atmos local runtime data. */
export function isAtmosRuntimeDir(node: {
  name?: string;
  path?: string;
}): boolean {
  if (node.name === ".atmos") return true;
  const path = (node.path ?? "").replace(/\/+$/, "");
  return path === ".atmos" || path.endsWith("/.atmos");
}

/**
 * Multi-hue scale by share of chart root: cool/small → warm/large
 * (cyan → green → yellow → orange → red), similar to disk-usage maps in ECharts demos.
 * Returns #rrggbb for reliable ECharts canvas fills (hsl can flash black on state paint).
 */
export function sizeToUsageColor(ratio: number, siblingIndex = 0): string {
  // Ease mid-range so mid-sized folders still get distinct hues.
  const t = Math.max(0, Math.min(1, Math.pow(ratio, 0.55)));
  // Spread peers by a few degrees so equal ratios don't paint as one mud color.
  const jitter = siblingIndex === 0 ? 0 : ((siblingIndex * 23) % 25) - 12;

  // Continuous hue: 205° cyan-blue (tiny) → 0° red (largest).
  const hue = (205 * (1 - t) + jitter + 360) % 360;
  const sat = (58 + t * 28) / 100; // 0.58–0.86
  const light = (54 - t * 12) / 100; // 0.54–0.42
  return hslToHex(hue, sat, light);
}

/** HSL (h degrees, s/l 0–1) → #rrggbb */
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = l - c / 2;
  const toByte = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v + m)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
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
