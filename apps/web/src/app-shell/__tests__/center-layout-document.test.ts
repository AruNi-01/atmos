import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createDefaultLayout,
  splitPane,
} from "@/app-shell/center-pane/center-pane-layout";
import {
  fromCenterLayoutWire,
  mergeCenterSpaceThumbnails,
  normalizeCenterLayoutDocument,
  toCenterLayoutWire,
  trimCenterLayoutForDisk,
} from "@/app-shell/center-layout/center-layout-document";
import {
  DEFAULT_CENTER_SPACE_ID,
  DEFAULT_CENTER_SPACE_NAME,
} from "@/app-shell/center-space/center-space";

describe("center layout document", () => {
  it("round-trips mosaics, spaces, and fullscreen through the wire shape", () => {
    const mosaic = splitPane(createDefaultLayout(["terminal"], "terminal"), {
      direction: "right",
    });
    const withFullscreen = { ...mosaic, fullscreenPaneId: mosaic.order[1]! };
    const local = normalizeCenterLayoutDocument({
      updatedAt: 10,
      mosaics: { "ws-1": withFullscreen },
      spaces: {
        "ws-1": {
          activeSpaceId: DEFAULT_CENTER_SPACE_ID,
          spaces: [
            {
              id: DEFAULT_CENTER_SPACE_ID,
              name: DEFAULT_CENTER_SPACE_NAME,
              createdAt: 1,
              updatedAt: 1,
              thumbnailDataUrl: "data:image/jpeg;base64,qq",
            },
          ],
        },
      },
      savedLayouts: [{ id: "layout-1", name: "Split", createdAt: 1, updatedAt: 1, panes: [], order: [], columnCount: 1, columnFractions: [1], rowFractions: [1] }],
      overviewTabs: { "ws-1": true },
    });
    const wire = toCenterLayoutWire(local);
    expect(wire.updated_at).toBe(10);
    expect(wire.overview_tabs["ws-1"]).toBe(true);
    expect(
      (wire.spaces["ws-1"] as { spaces: { thumbnailDataUrl?: string | null }[] }).spaces[0]
        ?.thumbnailDataUrl,
    ).toBeNull();
    const mosaics = wire.mosaics as Record<string, { fullscreenPaneId?: string | null }>;
    expect(mosaics["ws-1"]?.fullscreenPaneId).toBe(mosaic.order[1]);
    expect(wire.terminals ?? {}).toEqual({});

    const restored = fromCenterLayoutWire(wire);
    expect(restored.mosaics["ws-1"]?.fullscreenPaneId).toBe(mosaic.order[1]);
    expect(restored.overviewTabs["ws-1"]).toBe(true);
  });

  it("keeps in-memory thumbnails when disk spaces omit them", () => {
    const merged = mergeCenterSpaceThumbnails(
      {
        "ws-1": {
          activeSpaceId: DEFAULT_CENTER_SPACE_ID,
          spaces: [
            {
              id: DEFAULT_CENTER_SPACE_ID,
              name: DEFAULT_CENTER_SPACE_NAME,
              createdAt: 1,
              updatedAt: 2,
              thumbnailDataUrl: null,
            },
          ],
        },
      },
      {
        "ws-1": {
          activeSpaceId: DEFAULT_CENTER_SPACE_ID,
          spaces: [
            {
              id: DEFAULT_CENTER_SPACE_ID,
              name: DEFAULT_CENTER_SPACE_NAME,
              createdAt: 1,
              updatedAt: 1,
              thumbnailDataUrl: "data:image/jpeg;base64,keep",
            },
          ],
        },
      },
    );
    expect(merged["ws-1"]?.spaces[0]?.thumbnailDataUrl).toBe(
      "data:image/jpeg;base64,keep",
    );
  });

  it("strips thumbnails before a disk snapshot", () => {
    const stripped = trimCenterLayoutForDisk(
      normalizeCenterLayoutDocument({
        spaces: {
          "ws-1": {
            activeSpaceId: DEFAULT_CENTER_SPACE_ID,
            spaces: [
              {
                id: DEFAULT_CENTER_SPACE_ID,
                name: DEFAULT_CENTER_SPACE_NAME,
                createdAt: 1,
                updatedAt: 1,
                thumbnailDataUrl: "data:image/jpeg;base64,abc",
              },
            ],
          },
        },
      }),
    );
    expect(stripped.spaces["ws-1"]?.spaces[0]?.thumbnailDataUrl).toBeNull();
  });

  it("keeps terminal splits for the default space and extra spaces", () => {
    const extra = "ws-1::space::space-abc";
    const restored = fromCenterLayoutWire({
      version: 1,
      updated_at: 4,
      spaces: {},
      mosaics: {},
      saved_layouts: [],
      overview_tabs: {},
      terminals: {
        "ws-1": {
          schema: "terminal-layout.v1",
          tabs: [{ id: "terminal", title: "Term", closable: true, layout: "pane-host", panes: {} }],
        },
        [extra]: {
          schema: "terminal-layout.v1",
          tabs: [{ id: "terminal", title: "Term", closable: true, layout: "pane-a", panes: {} }],
        },
      },
    });
    expect(restored.terminals["ws-1"]?.tabs[0]?.layout).toBe("pane-host");
    expect(restored.terminals[extra]?.tabs[0]?.id).toBe("terminal");
  });

  it("wires CenterStage to the unified disk document instead of function settings", () => {
    const dir = join(import.meta.dir, "..");
    const stage = readFileSync(join(dir, "CenterStage.tsx"), "utf8");
    const persist = readFileSync(join(dir, "center-layout/center-layout-persist.ts"), "utf8");
    const layoutStore = readFileSync(
      join(dir, "center-pane/center-pane-layout-store.ts"),
      "utf8",
    );
    expect(stage).toContain("syncCenterLayoutFromDisk");
    expect(stage).toContain("layoutDiskSynced");
    expect(stage).toContain("readCenterStageLastTab");
    expect(stage).not.toContain("syncSavedLayoutsFromDisk");
    expect(persist).not.toMatch(
      /useCenterSpaceStore\.setState\(\{\s*byHost: spaces,\s*hydrated: true,\s*diskSynced: true/,
    );
    expect(persist).toContain("centerLayoutApi.put");
    expect(persist).not.toContain("function_settings");
    expect(layoutStore).toContain("markCenterLayoutDirty");
    expect(layoutStore).not.toContain("atmos.center-pane-layout.v1");
    expect(persist).toContain("snapshotSpaceTerminals");
    const terminalStore = readFileSync(
      join(import.meta.dir, "../../features/terminal/store/use-terminal-store.ts"),
      "utf8",
    );
    expect(terminalStore).not.toContain("workspaceLayoutApi");
    expect(terminalStore).toContain("center-layout-persist");
  });
});
