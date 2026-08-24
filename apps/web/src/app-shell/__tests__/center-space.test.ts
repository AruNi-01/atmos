import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CENTER_SPACE_ID,
  DEFAULT_CENTER_SPACE_NAME,
  hostIdFromCenterKey,
  isExtraCenterSpaceKey,
  makeCenterSpaceKey,
  nextSpaceName,
  normalizeHostCenterSpaces,
  omitCenterSpaceThumbnails,
  parseCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import {
  centerSpaceFanCssVars,
  centerSpaceFanPose,
} from "@/app-shell/center-space/center-space-fan";
import { useCenterSpaceStore } from "@/app-shell/center-space/center-space-store";
import {
  createEmptyCenterLayout,
  isFreshEmptyCenterLayout,
} from "@/app-shell/center-pane/center-pane-layout";
import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import { getWorkspaceTerminalTabs } from "@/features/terminal/store/terminal-store-helpers";
import { resolveCenterStageProjectContext } from "@/app-shell/center-stage-project-context";
import { globalKey, readJson } from "@/shared/lib/browser-store";

const dir = join(import.meta.dir, "..");

describe("center space keys", () => {
  it("keeps the default space on the host paint id", () => {
    expect(makeCenterSpaceKey("ws-1", DEFAULT_CENTER_SPACE_ID)).toBe("ws-1");
    expect(parseCenterSpaceKey("ws-1")).toEqual({
      hostId: "ws-1",
      spaceId: DEFAULT_CENTER_SPACE_ID,
    });
  });

  it("namespaces extra spaces without colliding with terminal tab scopes", () => {
    const key = makeCenterSpaceKey("ws-1", "space-abc");
    expect(key).toBe("ws-1::space::space-abc");
    expect(parseCenterSpaceKey(key)).toEqual({
      hostId: "ws-1",
      spaceId: "space-abc",
    });
    expect(hostIdFromCenterKey(key)).toBe("ws-1");
    expect(hostIdFromCenterKey("ws-1::terminal-2")).toBe("ws-1::terminal-2");
  });

  it("normalizes host records and always keeps the default space", () => {
    const next = normalizeHostCenterSpaces({
      activeSpaceId: "missing",
      spaces: [{ id: "space-2", name: "Files" }],
    });
    expect(next.spaces[0]?.id).toBe(DEFAULT_CENTER_SPACE_ID);
    expect(next.activeSpaceId).toBe(DEFAULT_CENTER_SPACE_ID);
    expect(next.spaces.map((space) => space.id)).toContain("space-2");
    expect(next.spaces[0]?.name).toBe(DEFAULT_CENTER_SPACE_NAME);
  });

  it("renames a stored Space 1 default to Default", () => {
    const next = normalizeHostCenterSpaces({
      activeSpaceId: "main",
      spaces: [{ id: "main", name: "Space 1", createdAt: 1, updatedAt: 1 }],
    });
    expect(next.spaces[0]?.name).toBe(DEFAULT_CENTER_SPACE_NAME);
  });

  it("increments extra space names from Space 1", () => {
    expect(
      nextSpaceName([{ id: "main", name: DEFAULT_CENTER_SPACE_NAME, createdAt: 1, updatedAt: 1 }]),
    ).toBe("Space 1");
    expect(
      nextSpaceName([
        { id: "main", name: DEFAULT_CENTER_SPACE_NAME, createdAt: 1, updatedAt: 1 },
        { id: "space-2", name: "Space 1", createdAt: 1, updatedAt: 1 },
      ]),
    ).toBe("Space 2");
  });

  it("marks extra space paint ids", () => {
    expect(isExtraCenterSpaceKey("ws-1")).toBe(false);
    expect(isExtraCenterSpaceKey("ws-1::space::abc")).toBe(true);
    expect(isExtraCenterSpaceKey(null)).toBe(false);
    expect(isExtraCenterSpaceKey(undefined)).toBe(false);
  });

  it("resolves extra space paint ids to the host workspace path", () => {
    const projects = [
      {
        id: "proj-1",
        name: "Atmos",
        mainFilePath: "/Users/me/atmos",
        workspaces: [
          {
            id: "ws-1",
            name: "blastoise",
            localPath: "/Users/me/atmos/worktrees/blastoise",
          },
        ],
      },
    ] as never;
    const extra = makeCenterSpaceKey("ws-1", "space-abc");
    const fromHost = resolveCenterStageProjectContext(projects, "ws-1");
    const fromSpace = resolveCenterStageProjectContext(projects, extra);
    expect(fromSpace.currentWorkspace?.id).toBe("ws-1");
    expect(fromSpace.currentWorkspace?.localPath).toBe(
      "/Users/me/atmos/worktrees/blastoise",
    );
    expect(fromSpace.currentProject?.id).toBe(fromHost.currentProject?.id);
  });

  it("does not allocate a new spaces array on empty host reads", () => {
    const first = useCenterSpaceStore.getState().list("missing-host");
    const second = useCenterSpaceStore.getState().list("missing-host");
    expect(first).toBe(second);
    expect(first).toEqual([]);
  });

  it("fans cards downward and lifts the hovered card in front", () => {
    const left = centerSpaceFanPose(0, 3, true, null);
    const mid = centerSpaceFanPose(1, 3, true, null);
    const right = centerSpaceFanPose(2, 3, true, null);
    expect(left.x).toBe(-99);
    expect(right.x).toBe(99);
    expect(left.rotate).toBe(-20);
    expect(right.rotate).toBe(20);
    expect(mid.y).toBe(22);
    const hovered = centerSpaceFanPose(0, 3, true, 0);
    expect(hovered.z).toBeGreaterThan(right.z);
    expect(hovered.scale).toBeGreaterThan(mid.scale);
    expect(centerSpaceFanPose(1, 3, false, null).opacity).toBe(0);
    const vars = centerSpaceFanCssVars(left);
    expect(vars["--fan-x"]).toBe(`${left.x}px`);
    expect(vars["--fan-rotate"]).toBe(`${left.rotate}deg`);
  });

  it("persists thumbnails to localStorage without writing function settings", () => {
    const host = "ws-thumb-memory";
    useCenterSpaceStore.getState().hydrate();
    useCenterSpaceStore.getState().ensureHost(host);
    useCenterSpaceStore
      .getState()
      .setThumbnail(host, DEFAULT_CENTER_SPACE_ID, "data:image/jpeg;base64,qq");
    expect(
      useCenterSpaceStore.getState().list(host)[0]?.thumbnailDataUrl,
    ).toBe("data:image/jpeg;base64,qq");
    const stored = readJson<Record<
      string,
      { spaces?: { thumbnailDataUrl?: string | null }[] }
    > | null>(globalKey("center-spaces"), null);
    if (typeof localStorage !== "undefined") {
      expect(stored?.[host]?.spaces?.[0]?.thumbnailDataUrl).toBe(
        "data:image/jpeg;base64,qq",
      );
    }
  });

  it("strips jpeg data urls before durable writes", () => {
    const stripped = omitCenterSpaceThumbnails({
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
    });
    expect(stripped["ws-1"]?.spaces[0]?.thumbnailDataUrl).toBeNull();
  });
});

describe("center space wiring", () => {
  it("creates a space from the plus menu and opens saved layouts in a new space", () => {
    const stage = readFileSync(join(dir, "CenterStage.tsx"), "utf8");
    const tabBar = readFileSync(join(dir, "CenterStageTabBar.tsx"), "utf8");
    const header = readFileSync(join(dir, "Header.tsx"), "utf8");
    expect(tabBar).toContain("onCreateSpace");
    expect(tabBar).toContain("stableAgentPaneId");
    const stageTabs = readFileSync(join(dir, "center-stage-tabs.tsx"), "utf8");
    expect(stageTabs).toContain("stableAgentPaneId");
    expect(tabBar).toContain("newSpaceDialogTitle");
    expect(tabBar).toContain("confirmCreateSpace");
    expect(tabBar).toContain("newSpace");
    expect(stage).toContain("openNewCenterSpace");
    expect(stage).toContain("switchCenterSpace(liveHostContextId, targetSpaceId)");
    expect(stage).toContain("shouldHonorUrlTabForPaintContext");
    expect(stage).toContain("bindCenterPaintTabUrlWriter");
    expect(stage).toContain("activateCenterChromeTab");
    expect(stage).toContain("spaceIdFromTmuxWindowName");
    expect(stage).toContain("handleApplyCenterLayout");
    expect(stage).toContain("liveExtraSpaceEmpty");
    expect(stage).toContain("createEmptyCenterLayout");
    const frame = readFileSync(join(dir, "workspace-center-frame.tsx"), "utf8");
    expect(frame).toContain("hostIdFromCenterKey(contextId)");
    expect(frame).toContain("currentWorkspace?.localPath");
    const grid = readFileSync(
      join(dir, "../features/terminal/components/TerminalGrid.tsx"),
      "utf8",
    );
    expect(grid).toContain("hostIdFromCenterKey(workspaceId)");
    expect(grid).toContain("listTmuxWindows(hostIdFromCenterKey(workspaceId))");
    expect(stage).toContain("listTmuxWindows(hostIdFromCenterKey(effectiveContextId))");
    expect(stage).not.toContain("shouldConfirmReplaceCenterLayout");
    expect(header).toContain("CenterSpaceSwitcher");
    expect(header.indexOf("HeaderGitContext")).toBeLessThan(
      header.indexOf("<CenterSpaceSwitcher"),
    );
    expect(header).toContain("flex min-w-0 items-center gap-5");
    const switcherSrc = readFileSync(join(dir, "center-space/center-space-switch.ts"), "utf8");
    const seedAt = switcherSrc.indexOf("setLayout(incoming, createEmptyCenterLayout())");
    const createAt = switcherSrc.indexOf("store.createSpace(hostId, name, spaceId)");
    expect(seedAt).toBeGreaterThan(0);
    expect(createAt).toBeGreaterThan(seedAt);
    expect(switcherSrc).toContain("scheduleIncomingSpaceThumbnail");
    expect(switcherSrc).toContain("refreshActiveCenterSpacePreview");
    expect(switcherSrc).toContain("runCenterSpaceSlide");
    expect(switcherSrc).toContain("clearCenterDeepLinkUrl");
    expect(switcherSrc).toContain("invalidateCenterSpaceThumbnailCapture");
    expect(switcherSrc).not.toContain("useCenterSpaceSlideStore");
    expect(switcherSrc).not.toContain("await captureActiveCenterSpaceThumbnail(hostId);\n  const outgoing");
    const switcher = readFileSync(join(dir, "center-space/CenterSpaceSwitcher.tsx"), "utf8");
    expect(switcher).toContain("centerSpaceFanPose");
    expect(switcher).toContain("handleToggleOpen");
    expect(switcher).toContain("handlePointerEnter");
    expect(switcher).toContain("onPointerEnter={handlePointerEnter}");
    expect(switcher).toContain("onPointerLeave={handlePointerLeave}");
    expect(switcher).toContain("onFocus={handlePointerEnter}");
    expect(switcher).toContain("schedulePreview");
    expect(switcher).toContain("ensurePreview");
    expect(switcher).toContain("void ensurePreview(true)");
    expect(switcher).not.toContain("await ensurePreview()");
    expect(switcher).toContain("refreshActiveCenterSpacePreview");
    expect(switcher).toContain("center-space-fan.css");
    expect(switcher).not.toContain("motion/react");
    expect(switcher).not.toContain("setHoveredIndex");
    expect(switcher).not.toContain("captureCurrentPreview");
    expect(switcher).toContain('t("defaultSpace")');
    expect(switcher).not.toContain("absolute left-1/2 top-1/2");
    expect(switcher).toContain("buttonCountAria");
    expect(switcher).toContain("-left-1 -top-1");
    expect(switcher).toContain("h-2.5 min-w-2.5");
    expect(switcher).toContain("text-[8px]");
    expect(switcher).toContain("{spaces.length}");
    expect(switcher).toContain("bg-emerald-500");
    expect(switcher).toContain("agent-attention-ring-card");
    expect(switcher).toContain("offActiveSpaceAttentionReason");
    expect(switcher).toContain("hostSpaceAttentionReasons");
    const toggleAt = switcher.indexOf("const handleToggleOpen");
    const openAt = switcher.indexOf("setOpen(true)", toggleAt);
    const captureAt = switcher.indexOf("void ensurePreview(true)", toggleAt);
    expect(openAt).toBeGreaterThan(toggleAt);
    expect(captureAt).toBeGreaterThan(openAt);
    const thumb = readFileSync(join(dir, "center-space/center-space-thumbnail.ts"), "utf8");
    expect(thumb).toContain("snapdom.toCanvas");
    expect(thumb).toContain("paintXtermBufferInto");
    expect(thumb).toContain("THUMB_WIDTH = 136");
    expect(thumb).not.toContain("html-to-image");
    expect(thumb).not.toContain("html2canvas");
    expect(thumb).not.toContain("THUMB_WIDTH = 280");
    const fanCss = readFileSync(join(dir, "center-space/center-space-fan.css"), "utf8");
    expect(fanCss).toContain("translate3d(var(--fan-x), var(--fan-y), 0)");
    expect(fanCss).toContain("will-change: transform, opacity");
    const storeSrc = readFileSync(join(dir, "center-space/center-space-store.ts"), "utf8");
    expect(storeSrc).toContain("omitCenterSpaceThumbnails");
    expect(storeSrc).toContain("writeJson(STORAGE_KEY, byHost)");
    const persistDiskAt = storeSrc.indexOf("async function persistDisk");
    const persistLocalAt = storeSrc.indexOf("function persistLocal");
    expect(persistLocalAt).toBeGreaterThan(0);
    expect(persistDiskAt).toBeGreaterThan(persistLocalAt);
    const persistDiskBlock = storeSrc.slice(persistDiskAt, storeSrc.indexOf("function commit"));
    expect(persistDiskBlock).toContain("omitCenterSpaceThumbnails(byHost)");
    const setThumbAt = storeSrc.indexOf("setThumbnails: (hostId, thumbs)");
    const renameAt = storeSrc.indexOf("renameSpace: (hostId, spaceId, name)", setThumbAt);
    const setThumbBlock = storeSrc.slice(setThumbAt, renameAt);
    expect(setThumbBlock).not.toContain("commit(");
    expect(setThumbBlock).toContain("persistLocal(byHost)");
  });

  it("does not invent a default terminal tab for extra spaces", () => {
    const extra = "ws-1::space::space-abc";
    expect(getWorkspaceTerminalTabs({ workspaceTerminalTabs: {} }, extra)).toEqual([]);
    expect(
      getWorkspaceTerminalTabs({ workspaceTerminalTabs: {} }, "ws-1")[0]?.id,
    ).toBe("terminal");
  });

  it("does not seed extra spaces from the current open-tab list", () => {
    const extra = "ws-1::space::space-abc";
    useCenterPaneLayoutStore.setState({ byContext: {}, hydrated: true });
    const layout = useCenterPaneLayoutStore
      .getState()
      .ensureLayout(extra, ["terminal", "files", "overview"], "files");
    expect(isFreshEmptyCenterLayout(layout)).toBe(true);
    expect(layout.panes[0]?.tabIds).toEqual([]);
    expect(createEmptyCenterLayout().panes[0]?.tabIds).toEqual([]);
  });
});
