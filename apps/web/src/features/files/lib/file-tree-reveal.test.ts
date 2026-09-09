import { describe, expect, test } from "bun:test";

import { TREE_BRANCH_DURATION_MS } from "./file-tree-branch-open";
import {
  expandFileTreeRevealAncestors,
  fileTreeScrollBehavior,
  findFileTreeScrollParent,
  scrollFileTreeRowIntoView,
  waitForFileTreeRowLayout,
  type FileTreeRevealItem,
  type FileTreeRevealTree,
} from "./file-tree-reveal";

function createFolderItem(state: {
  folders: Set<string>;
  dataReady: Set<string>;
  expanded: string[];
  loading: Set<string>;
  id: string;
}): FileTreeRevealItem {
  return {
    isFolder: () =>
      state.dataReady.has(state.id) && state.folders.has(state.id),
    isExpanded: () => state.expanded.includes(state.id),
    expand: () => {
      if (state.loading.has(state.id)) return;
      if (!state.expanded.includes(state.id)) state.expanded.push(state.id);
    },
  };
}

describe("expandFileTreeRevealAncestors", () => {
  test("loads item data before treating a nested path as a folder", async () => {
    const expanded: string[] = [];
    const dataReady = new Set<string>(["/repo/src"]);
    const folders = new Set(["/repo/src", "/repo/src/lib"]);
    const loadedData: string[] = [];
    const loadedChildren: string[] = [];
    const listed: string[] = [];

    const tree: FileTreeRevealTree = {
      getItemInstance: (id) =>
        createFolderItem({
          folders,
          dataReady,
          expanded,
          loading: new Set(),
          id,
        }),
      waitForItemDataLoaded: async (id) => {
        loadedData.push(id);
        dataReady.add(id);
      },
      waitForItemChildrenLoaded: async (id) => {
        loadedChildren.push(id);
      },
    };

    const result = await expandFileTreeRevealAncestors({
      rootPath: "/repo",
      targetPath: "/repo/src/lib/a.ts",
      loadDirectoryChildren: async (path) => {
        listed.push(path);
      },
      getTree: () => tree,
      isCancelled: () => false,
    });

    expect(listed).toEqual(["/repo/src", "/repo/src/lib", "/repo/src/lib/a.ts"]);
    expect(loadedData).toEqual([
      "/repo/src",
      "/repo/src/lib",
      "/repo/src/lib/a.ts",
    ]);
    expect(expanded).toEqual(["/repo/src", "/repo/src/lib"]);
    expect(loadedChildren).toEqual(["/repo/src", "/repo/src/lib"]);
    expect(result.expandedAny).toBe(true);
    expect(result.item).toBeTruthy();
  });

  test("retries expand after children finish loading", async () => {
    const expanded: string[] = [];
    const loading = new Set(["/repo/src"]);
    const dataReady = new Set(["/repo/src", "/repo/src/a.ts"]);
    const folders = new Set(["/repo/src"]);

    const tree: FileTreeRevealTree = {
      getItemInstance: (id) =>
        createFolderItem({ folders, dataReady, expanded, loading, id }),
      waitForItemDataLoaded: async () => {},
      waitForItemChildrenLoaded: async (id) => {
        loading.delete(id);
      },
    };

    const result = await expandFileTreeRevealAncestors({
      rootPath: "/repo",
      targetPath: "/repo/src/a.ts",
      loadDirectoryChildren: async () => {},
      getTree: () => tree,
      isCancelled: () => false,
    });

    expect(expanded).toEqual(["/repo/src"]);
    expect(result.expandedAny).toBe(true);
  });

  test("does not expand a file leaf and reports no expand when already open", async () => {
    const expanded = ["/repo/src"];
    const dataReady = new Set(["/repo/src", "/repo/src/a.ts"]);
    const folders = new Set(["/repo/src"]);

    const tree: FileTreeRevealTree = {
      getItemInstance: (id) =>
        createFolderItem({
          folders,
          dataReady,
          expanded,
          loading: new Set(),
          id,
        }),
      waitForItemDataLoaded: async () => {},
      waitForItemChildrenLoaded: async () => {},
    };

    const result = await expandFileTreeRevealAncestors({
      rootPath: "/repo",
      targetPath: "/repo/src/a.ts",
      loadDirectoryChildren: async () => {},
      getTree: () => tree,
      isCancelled: () => false,
    });

    expect(expanded).toEqual(["/repo/src"]);
    expect(result.expandedAny).toBe(false);
  });

  test("stops walking when cancelled after a listDir", async () => {
    let cancelled = false;
    const listed: string[] = [];
    const tree: FileTreeRevealTree = {
      getItemInstance: () => ({
        isFolder: () => true,
        isExpanded: () => false,
        expand: () => {},
      }),
    };

    const result = await expandFileTreeRevealAncestors({
      rootPath: "/repo",
      targetPath: "/repo/src/lib/a.ts",
      loadDirectoryChildren: async (path) => {
        listed.push(path);
        cancelled = true;
      },
      getTree: () => tree,
      isCancelled: () => cancelled,
    });

    expect(listed).toEqual(["/repo/src"]);
    expect(result.item).toBeNull();
    expect(result.expandedAny).toBe(false);
  });
});

describe("waitForFileTreeRowLayout", () => {
  test("waits until the row exists, delay elapses, and position is stable", async () => {
    let height = 0;
    let top = 10;
    let frames = 0;
    const element = {
      getBoundingClientRect: () => ({
        height,
        width: 120,
        top,
        bottom: top + height,
        left: 0,
        right: 120,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }),
      checkVisibility: () => height > 1,
    } as unknown as HTMLElement;

    const found = await waitForFileTreeRowLayout(
      () => (frames === 0 ? null : element),
      {
        minDelayMs: 0,
        timeoutMs: 1000,
        waitFrame: async () => {
          frames += 1;
          if (frames === 1) {
            height = 24;
            top = 40;
          } else if (frames === 2) {
            top = 80;
          } else {
            top = 120;
          }
        },
      },
    );

    expect(found).toBe(element);
    expect(frames).toBeGreaterThanOrEqual(4);
  });

  test("returns null when cancelled before the row mounts", async () => {
    const found = await waitForFileTreeRowLayout(() => null, {
      isCancelled: () => true,
      timeoutMs: 100,
      waitFrame: async () => {},
    });
    expect(found).toBeNull();
  });
});

describe("scrollFileTreeRowIntoView", () => {
  function createScroller() {
    const calls: ScrollToOptions[] = [];
    const scroller = {
      scrollTop: 0,
      scrollTo(options: ScrollToOptions) {
        calls.push(options);
        if (typeof options.top === "number") this.scrollTop = options.top;
      },
      getBoundingClientRect: () =>
        ({
          top: 0,
          bottom: 200,
          height: 200,
          left: 0,
          right: 100,
          width: 100,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    };
    return { scroller, calls };
  }

  test("smooth-scrolls the marked panel scroller instead of overflow-hidden ancestors", () => {
    const { scroller, calls } = createScroller();

    const row = {
      closest: (selector: string) =>
        selector === "[data-file-tree-scroll]" ? scroller : null,
      getBoundingClientRect: () =>
        ({
          top: 400,
          bottom: 424,
          height: 24,
          left: 0,
          right: 100,
          width: 100,
          x: 0,
          y: 400,
          toJSON: () => ({}),
        }) as DOMRect,
      scrollIntoView: () => {
        throw new Error("should not use scrollIntoView when a scroller exists");
      },
    } as unknown as HTMLElement;

    scrollFileTreeRowIntoView(row);
    const top = 400 - (200 - 24) / 2;
    expect(calls).toEqual([{ top, behavior: "smooth" }]);
    expect(scroller.scrollTop).toBe(top);
    expect(findFileTreeScrollParent(row)).toBe(scroller as unknown as HTMLElement);
  });

  test("uses instant scroll when reduced motion is requested", () => {
    const { scroller, calls } = createScroller();
    const row = {
      closest: () => scroller,
      getBoundingClientRect: () =>
        ({
          top: 400,
          bottom: 424,
          height: 24,
          left: 0,
          right: 100,
          width: 100,
          x: 0,
          y: 400,
          toJSON: () => ({}),
        }) as DOMRect,
    } as unknown as HTMLElement;

    scrollFileTreeRowIntoView(row, { behavior: "auto" });
    expect(calls).toEqual([{ top: 400 - (200 - 24) / 2, behavior: "auto" }]);
  });

  test("falls back to smooth scrollIntoView when no scroller exists", () => {
    const calls: ScrollIntoViewOptions[] = [];
    const row = {
      closest: () => null,
      parentElement: null,
      getBoundingClientRect: () =>
        ({
          top: 400,
          bottom: 424,
          height: 24,
          left: 0,
          right: 100,
          width: 100,
          x: 0,
          y: 400,
          toJSON: () => ({}),
        }) as DOMRect,
      scrollIntoView: (options?: ScrollIntoViewOptions) => {
        if (options) calls.push(options);
      },
    } as unknown as HTMLElement;

    scrollFileTreeRowIntoView(row);
    expect(calls).toEqual([
      { block: "center", inline: "nearest", behavior: "smooth" },
    ]);
  });
});

describe("fileTreeScrollBehavior", () => {
  test("defaults to smooth when matchMedia is unavailable", () => {
    expect(fileTreeScrollBehavior()).toBe("smooth");
  });
});

describe("file tree branch reveal delay", () => {
  test("stays aligned with the folder enter transition", () => {
    expect(TREE_BRANCH_DURATION_MS).toBe(240);
  });
});
