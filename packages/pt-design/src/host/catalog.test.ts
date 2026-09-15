import { afterEach, describe, expect, test } from "bun:test";
import { localStoragePersistence } from "./adapters";
import {
  createPtDesignDoc,
  createPtDesignId,
  deletePtDesign,
  designListedInHost,
  filterPtDesigns,
  filterPtDesignsByHost,
  groupPinnedPtDesigns,
  inferPtDesignMeta,
  listPtDesignDocs,
  ptDesignDocKey,
  movePtDesign,
  renamePtDesign,
  setPtDesignPinned,
} from "./catalog";
import { sketchPreviewFromPersist } from "./preview";

type MemoryStorage = Storage & { store: Map<string, string> };

function installLocalStorage(): MemoryStorage {
  const store = new Map<string, string>();
  const storage: MemoryStorage = {
    store,
    get length() {
      return store.size;
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  return storage;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("pt-design catalog", () => {
  test("migrates unnamed v2 persist into global or workspace metadata", () => {
    const storage = installLocalStorage();
    storage.setItem(
      "pt-design/v2/global",
      JSON.stringify({
        ptx: `<page id="page"><button id="go" x="10" y="20" width="80" height="32">Go</button></page>\n`,
        canvas: {
          elements: [
            { id: "a", type: "rectangle", x: 10, y: 20, width: 80, height: 32, isDeleted: false },
          ],
          appState: { viewBackgroundColor: "#ffffff" },
        },
      }),
    );
    storage.setItem("pt-design/v2/ws-1", JSON.stringify({ ptx: `<page id="page"></page>\n` }));
    storage.setItem("pt-design/v2/ws-1:file", "old-name");
    const listed = listPtDesignDocs();
    expect(listed.map((row) => row.id).sort()).toEqual(["global", "ws-1"]);
    const global = listed.find((row) => row.id === "global")!;
    expect(global.meta.scope).toBe("global");
    expect(global.meta.openMode).toBe("canvas");
    expect(global.meta.preview).toBeUndefined();
    expect(global.meta.previewFit).toBeUndefined();
    const workspace = listed.find((row) => row.id === "ws-1")!;
    expect(workspace.meta.scope).toBe("workspace");
    expect(workspace.meta.openMode).toBe("center-tab");
    expect(workspace.meta.workspaceId).toBe("ws-1");
    expect(JSON.parse(storage.getItem("pt-design/v2/global")!).meta.id).toBe("global");
  });

  test("filters by scope and groups pinned designs separately", () => {
    installLocalStorage();
    const global = createPtDesignDoc({ id: "doc-g", scope: "global" })!;
    const project = createPtDesignDoc({
      id: "proj-1",
      scope: "project",
      openMode: "center-tab",
      projectId: "proj-1",
    })!;
    const workspace = createPtDesignDoc({
      id: "ws-2",
      scope: "workspace",
      openMode: "center-tab",
      workspaceId: "ws-2",
    })!;
    setPtDesignPinned(project.id, true, undefined, 10);
    setPtDesignPinned(workspace.id, true, undefined, 20);
    const listed = listPtDesignDocs();
    expect(filterPtDesigns(listed, "all")).toHaveLength(3);
    expect(filterPtDesigns(listed, "global").map((row) => row.id)).toEqual([global.id]);
    expect(filterPtDesigns(listed, "project").map((row) => row.id)).toEqual([project.id]);
    const grouped = groupPinnedPtDesigns(listed);
    expect(grouped.pinned.map((row) => row.id)).toEqual([project.id, workspace.id]);
    expect(grouped.rest.map((row) => row.id)).toEqual([global.id]);
  });

  test("rename, unpin, and delete persist without a parallel index", async () => {
    installLocalStorage();
    const created = createPtDesignDoc({ id: "doc-edit", name: "Draft" })!;
    const createdAt = created.meta.updatedAt;
    expect(renamePtDesign(created.id, "  Home  ")?.meta.name).toBe("Home");
    expect(renamePtDesign(created.id, "Home")?.meta.updatedAt).toBe(createdAt);
    expect(setPtDesignPinned(created.id, true)?.meta.pinned).toBe(true);
    expect(setPtDesignPinned(created.id, true)?.meta.updatedAt).toBe(createdAt);
    expect(setPtDesignPinned(created.id, false)?.meta.pinned).toBe(false);
    expect(setPtDesignPinned(created.id, false)?.meta.updatedAt).toBe(createdAt);
    expect(movePtDesign(created.id, { scope: "project", projectId: "proj-1" })?.meta).toMatchObject({
      scope: "project",
      projectId: "proj-1",
      updatedAt: createdAt,
    });
    expect(movePtDesign(created.id, { scope: "global" })?.meta).toMatchObject({
      scope: "global",
      updatedAt: createdAt,
    });
    expect(movePtDesign(created.id, { scope: "global" })?.meta.projectId).toBeUndefined();
    expect(deletePtDesign(created.id)).toBe(true);
    expect(listPtDesignDocs()).toEqual([]);
    expect(await localStoragePersistence(ptDesignDocKey(created.id)).load()).toBeNull();
  });

  test("created ids stay canvas/global and overview listing does not emit bbox-rect SVG", () => {
    expect(createPtDesignId().startsWith("doc-")).toBe(true);
    const meta = inferPtDesignMeta("doc-1", {
      ptx: `<page id="page"><input id="q" x="0" y="0" width="40" height="20"/></page>\n`,
    });
    expect(meta.scope).toBe("global");
    expect(meta.openMode).toBe("canvas");
    expect(meta.preview).toBeUndefined();
    const helper = sketchPreviewFromPersist({
      ptx: `<page id="page"><input id="q" x="0" y="0" width="40" height="20"/></page>\n`,
    });
    expect(helper).toContain("data:image/svg+xml");
    expect(helper).toContain("rect");
    expect(decodeURIComponent(helper!)).toContain('data-pt-preview="content"');
  });

  test("host filter keeps only the current project or workspace", () => {
    installLocalStorage();
    const global = createPtDesignDoc({ id: "doc-g", scope: "global" })!;
    const project = createPtDesignDoc({
      id: "proj-1",
      scope: "project",
      openMode: "center-tab",
      projectId: "proj-1",
    })!;
    const workspace = createPtDesignDoc({
      id: "ws-2",
      scope: "workspace",
      openMode: "center-tab",
      workspaceId: "ws-2",
    })!;
    const listed = listPtDesignDocs();
    expect(filterPtDesignsByHost(listed, { kind: "global" })).toHaveLength(3);
    expect(filterPtDesignsByHost(listed, { kind: "project", projectId: "proj-1" }).map((row) => row.id)).toEqual([
      project.id,
    ]);
    expect(filterPtDesignsByHost(listed, { kind: "workspace", workspaceId: "ws-2" }).map((row) => row.id)).toEqual([
      workspace.id,
    ]);
    expect(designListedInHost(global.meta, { kind: "project", projectId: "proj-1" })).toBe(false);
  });

  test("list drops a stored wireframe SVG instead of replacing it with bbox rects", () => {
    const storage = installLocalStorage();
    storage.setItem(
      "pt-design/v2/global",
      JSON.stringify({
        ptx: `<page id="page"><button id="go" x="240" y="160" width="180" height="48">Go</button></page>\n`,
        meta: {
          id: "global",
          name: "Old",
          scope: "global",
          pinned: false,
          pinOrder: 0,
          updatedAt: 1,
          openMode: "canvas",
          preview: "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg viewBox="0 0 320 180"></svg>'),
          previewFit: "content",
        },
      }),
    );
    const listed = listPtDesignDocs();
    expect(listed[0]!.meta.preview).toBeUndefined();
    expect(listed[0]!.meta.previewFit).toBeUndefined();
    const stored = JSON.parse(storage.getItem("pt-design/v2/global")!);
    expect(stored.meta.preview).toBeUndefined();
    expect(typeof stored.meta.preview === "string" ? stored.meta.preview : "").not.toContain("<rect");
  });

  test("list keeps an IndexedDB screenshot pointer without hydrating a board", () => {
    const storage = installLocalStorage();
    storage.setItem(
      "pt-design/v2/global",
      JSON.stringify({
        ptx: `<page id="page"><button id="go" x="240" y="160" width="180" height="48">Go</button></page>\n`,
        meta: {
          id: "global",
          name: "Home",
          scope: "global",
          pinned: false,
          pinOrder: 0,
          updatedAt: 1,
          openMode: "canvas",
          preview: "idb:pt-preview/global",
          previewFit: "content",
        },
      }),
    );
    const listed = listPtDesignDocs();
    expect(listed[0]!.meta.preview).toBe("idb:pt-preview/global");
    expect(listed[0]!.meta.previewFit).toBe("content");
  });
});
