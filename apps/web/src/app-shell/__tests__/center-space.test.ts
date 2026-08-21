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
  parseCenterSpaceKey,
} from "@/app-shell/center-space/center-space";
import { centerSpaceFanPose } from "@/app-shell/center-space/center-space-fan";
import { useCenterSpaceStore } from "@/app-shell/center-space/center-space-store";
import {
  createEmptyCenterLayout,
  isFreshEmptyCenterLayout,
} from "@/app-shell/center-pane/center-pane-layout";
import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import { getWorkspaceTerminalTabs } from "@/features/terminal/store/terminal-store-helpers";
import { resolveCenterStageProjectContext } from "@/app-shell/center-stage-project-context";

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
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
    expect(left.rotate).toBeLessThan(0);
    expect(right.rotate).toBeGreaterThan(0);
    expect(mid.y).toBeGreaterThan(0);
    const hovered = centerSpaceFanPose(0, 3, true, 0);
    expect(hovered.z).toBeGreaterThan(right.z);
    expect(hovered.scale).toBeGreaterThan(mid.scale);
    expect(centerSpaceFanPose(1, 3, false, null).opacity).toBe(0);
  });
});

describe("center space wiring", () => {
  it("creates a space from the plus menu and opens saved layouts in a new space", () => {
    const stage = readFileSync(join(dir, "CenterStage.tsx"), "utf8");
    const tabBar = readFileSync(join(dir, "CenterStageTabBar.tsx"), "utf8");
    const header = readFileSync(join(dir, "Header.tsx"), "utf8");
    expect(tabBar).toContain("onCreateSpace");
    expect(tabBar).toContain("newSpaceDialogTitle");
    expect(tabBar).toContain("confirmCreateSpace");
    expect(tabBar).toContain("newSpace");
    expect(stage).toContain("openNewCenterSpace");
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
    const switcher = readFileSync(join(dir, "center-space/CenterSpaceSwitcher.tsx"), "utf8");
    expect(switcher).toContain("centerSpaceFanPose");
    expect(switcher).toContain("setHoveredIndex");
    expect(switcher).toContain("handleToggleOpen");
    expect(switcher).toContain("captureActiveCenterSpaceThumbnail");
    expect(switcher).toContain("captureCurrentPreview");
    expect(switcher).toContain('t("defaultSpace")');
    expect(switcher).not.toContain("absolute left-1/2 top-1/2");
    expect(switcher).toContain("buttonCountAria");
    expect(switcher).toContain("-left-1.5 -top-1.5");
    expect(switcher).toContain("{spaces.length}");
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
