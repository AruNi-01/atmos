import { TREE_BRANCH_DURATION_MS } from "./file-tree-branch-open";

export const FILE_TREE_SCROLL_ATTR = "data-file-tree-scroll";

export type FileTreeRevealItem = {
  isFolder: () => boolean;
  isExpanded: () => boolean;
  expand: () => void;
  getElement?: () => HTMLElement | null | undefined;
  setFocused?: () => void;
};

export type FileTreeRevealTree = {
  getItemInstance: (itemId: string) => FileTreeRevealItem;
  waitForItemDataLoaded?: (itemId: string) => Promise<unknown>;
  waitForItemChildrenLoaded?: (itemId: string) => Promise<unknown>;
};

export type ExpandFileTreeRevealResult = {
  item: FileTreeRevealItem | null;
  expandedAny: boolean;
};

const SCROLLABLE_OVERFLOW = /(auto|scroll|overlay)/;

function waitAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function fileTreeBranchRevealDelayMs(): number {
  return prefersReducedMotion() ? 0 : TREE_BRANCH_DURATION_MS;
}

/**
 * Nested folders are not `isFolder()` until async item data is cached, and
 * `expand()` is a no-op while children are still loading. Walk every ancestor,
 * wait for data/children, then retry expand so one locate click opens the
 * whole path.
 */
export async function expandFileTreeRevealAncestors(params: {
  rootPath: string;
  targetPath: string;
  loadDirectoryChildren: (path: string) => Promise<unknown>;
  getTree: () => FileTreeRevealTree;
  isCancelled: () => boolean;
}): Promise<ExpandFileTreeRevealResult> {
  const { rootPath, targetPath, loadDirectoryChildren, getTree, isCancelled } =
    params;
  const relative = targetPath.slice(rootPath.length + 1);
  const segments = relative.split("/").filter(Boolean);
  let currentPath = rootPath;
  let expandedAny = false;

  for (const segment of segments) {
    currentPath = `${currentPath}/${segment}`;
    await loadDirectoryChildren(currentPath);
    if (isCancelled()) return { item: null, expandedAny };

    const tree = getTree();
    await tree.waitForItemDataLoaded?.(currentPath);
    if (isCancelled()) return { item: null, expandedAny };

    const item = getTree().getItemInstance(currentPath);
    if (!item.isFolder()) continue;

    if (!item.isExpanded()) {
      item.expand();
      expandedAny = true;
    }
    await getTree().waitForItemChildrenLoaded?.(currentPath);
    if (isCancelled()) return { item: null, expandedAny };

    // expand() is a no-op while `loadingItemChildrens` includes this folder.
    const latest = getTree().getItemInstance(currentPath);
    if (!latest.isExpanded()) {
      latest.expand();
      expandedAny = true;
      await getTree().waitForItemChildrenLoaded?.(currentPath);
      if (isCancelled()) return { item: null, expandedAny };
    }
  }

  return { item: getTree().getItemInstance(targetPath), expandedAny };
}

export function findFileTreeScrollParent(
  element: HTMLElement,
): HTMLElement | null {
  const marked = element.closest(`[${FILE_TREE_SCROLL_ATTR}]`);
  if (marked) return marked as HTMLElement;

  let node: HTMLElement | null = element.parentElement;
  while (node && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY;
    if (SCROLLABLE_OVERFLOW.test(overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * FileTreeBranch uses overflow:hidden + 0fr, which eats element.scrollIntoView
 * before the enter transition finishes. Scroll the panel scroller instead.
 */
export function scrollFileTreeRowIntoView(element: HTMLElement): void {
  const container = findFileTreeScrollParent(element);
  if (!container) {
    element.scrollIntoView({ block: "center", inline: "nearest" });
    return;
  }

  const elRect = element.getBoundingClientRect();
  const cRect = container.getBoundingClientRect();
  const offset = elRect.top - cRect.top - (cRect.height - elRect.height) / 2;
  container.scrollTop += offset;
}

function isRowVisuallyReady(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.height <= 1) return false;
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility({ checkOpacity: true });
  }
  return true;
}

/**
 * Branch rows mount one effect later and stay clipped (0fr / opacity 0) during
 * the enter transition. Wait until the row exists, optionally for the branch
 * animation, then until its viewport position stops moving.
 */
export async function waitForFileTreeRowLayout(
  getElement: () => HTMLElement | null | undefined,
  options?: {
    isCancelled?: () => boolean;
    timeoutMs?: number;
    minDelayMs?: number;
    waitFrame?: () => Promise<void>;
  },
): Promise<HTMLElement | null> {
  const timeoutMs = options?.timeoutMs ?? 2500;
  const minDelayMs = options?.minDelayMs ?? 0;
  const waitFrame = options?.waitFrame ?? waitAnimationFrame;
  const isCancelled = options?.isCancelled ?? (() => false);
  const deadline = Date.now() + timeoutMs;

  let element: HTMLElement | null = null;
  while (Date.now() < deadline) {
    if (isCancelled()) return null;
    element = getElement() ?? null;
    if (element) break;
    await waitFrame();
  }
  if (!element || isCancelled()) return element;

  if (minDelayMs > 0) {
    await delay(minDelayMs);
    if (isCancelled()) return element;
    element = getElement() ?? element;
  }

  let lastTop = Number.NaN;
  let stableFrames = 0;
  while (Date.now() < deadline) {
    if (isCancelled()) return element;
    element = getElement() ?? element;
    if (element && isRowVisuallyReady(element)) {
      const top = element.getBoundingClientRect().top;
      if (Number.isFinite(lastTop) && Math.abs(top - lastTop) < 0.5) {
        stableFrames += 1;
        if (stableFrames >= 2) return element;
      } else {
        stableFrames = 0;
      }
      lastTop = top;
    } else {
      stableFrames = 0;
      lastTop = Number.NaN;
    }
    await waitFrame();
  }

  return element;
}

export function resolveFileTreeRowElement(
  item: FileTreeRevealItem | null,
  path: string,
): HTMLElement | null {
  const fromTree = item?.getElement?.() ?? null;
  if (fromTree) return fromTree;
  if (typeof document === "undefined") return null;
  return document.querySelector(
    `[data-file-tree-row="${CSS.escape(path)}"]`,
  );
}
