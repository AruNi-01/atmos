// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import {
  buildCanvasWidgetPinKey,
  createGlobalCanvasContextRef,
  createCanvasWidgetShapeProps,
  getCanvasContextLabel,
  isGlobalCanvasContext,
  type CanvasContextRef,
} from "../lib/canvas-widget-shape";
import {
  createCanvasCenterTab,
  createCanvasCenterOverviewTab,
  ensureCanvasCenterOverviewTab,
  removeCanvasCenterTab,
  upsertCanvasCenterTab,
} from "../lib/canvas-center-tabs";

const context: CanvasContextRef = {
  contextScope: "workspace",
  projectId: "project-1",
  workspaceId: "workspace-1",
  projectName: "Atmos",
  workspaceName: "Canvas",
  localPath: "/repo/worktree",
  repoPath: "/repo/worktree",
};

describe("canvas-widget shape helpers", () => {
  it("creates stable pin keys for first-phase widgets", () => {
    expect(
      buildCanvasWidgetPinKey({
        type: "files",
        context,
        rootPath: "/repo/worktree",
      }),
    ).toBe("files:workspace:workspace-1:/repo/worktree");

    expect(
      buildCanvasWidgetPinKey(
        {
          type: "center",
          context,
          tabs: [],
          activeTabId: null,
        },
        "shape:frame-1",
      ),
    ).toBe("center:workspace:workspace-1:shape:frame-1");
  });

  it("creates global pin keys for context-free widgets", () => {
    const globalContext = createGlobalCanvasContextRef();

    expect(
      buildCanvasWidgetPinKey({
        type: "agent-status",
        context: globalContext,
      }),
    ).toBe("agent-status:global");

    expect(
      createCanvasWidgetShapeProps({
        widgetType: "agent-chat",
        source: {
          type: "agent-chat",
          context: globalContext,
        },
      }).pinKey,
    ).toBe("agent-chat:global");
  });

  it("does not treat an empty default context as global", () => {
    const emptyContext: CanvasContextRef = {
      contextScope: "workspace",
      projectId: null,
      workspaceId: null,
      projectName: "",
      workspaceName: null,
      localPath: "",
      repoPath: null,
    };

    expect(isGlobalCanvasContext(emptyContext)).toBe(false);
    expect(getCanvasContextLabel(emptyContext)).toBe("Workspace");
  });

  it("fills default dimensions and title from widget type", () => {
    const props = createCanvasWidgetShapeProps({
      widgetType: "changes",
      source: {
        type: "changes",
        context,
        group: "all",
      },
    });

    expect(props.title).toBe("Changes");
    expect(props.w).toBeGreaterThan(300);
    expect(props.h).toBeGreaterThan(300);
    expect(props.pinKey).toBe("changes:workspace:workspace-1:all");
  });

  it("uses Main Operating Area as the center widget title", () => {
    const overviewTab = createCanvasCenterOverviewTab();
    const props = createCanvasWidgetShapeProps({
      widgetType: "center",
      source: {
        type: "center",
        context,
        tabs: [overviewTab],
        activeTabId: overviewTab.id,
      },
    });

    expect(props.title).toBe("Main Operating Area");
    expect(overviewTab.id).toBe("overview");
  });

  it("dedupes center tabs by stable tab id", () => {
    const tab = createCanvasCenterTab({
      kind: "file",
      path: "/repo/worktree/src/app.ts",
      mode: "edit",
    });
    const added = upsertCanvasCenterTab([], tab);
    const repeated = upsertCanvasCenterTab(added.tabs, tab);

    expect(added.tabs).toHaveLength(1);
    expect(repeated.tabs).toHaveLength(1);
    expect(repeated.activeTabId).toBe(tab.id);
  });

  it("ensures center widgets keep an overview tab", () => {
    const tab = createCanvasCenterTab({
      kind: "file",
      path: "/repo/worktree/src/app.ts",
      mode: "edit",
    });
    const tabs = ensureCanvasCenterOverviewTab([tab]);

    expect(tabs.map((item) => item.kind)).toEqual(["overview", "file"]);
  });

  it("omits undefined optional fields from review center tabs", () => {
    const tab = createCanvasCenterTab({
      kind: "review-group",
      title: "Review",
      groupPath: "review-group://revision-1",
      diffFilePath: "src/app.ts",
      line: undefined,
      reviewCommentGuid: undefined,
      reviewMessageGuid: undefined,
      reviewSessionGuid: undefined,
      revisionGuid: "revision-1",
    });

    expect(Object.prototype.hasOwnProperty.call(tab, "line")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(tab, "reviewCommentGuid")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(tab, "reviewMessageGuid")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(tab, "reviewSessionGuid")).toBe(false);
  });

  it("sanitizes center widget source before storing it in shape props", () => {
    const props = createCanvasWidgetShapeProps({
      widgetType: "center",
      source: {
        type: "center",
        context,
        tabs: [
          createCanvasCenterTab({
            kind: "review-group",
            groupPath: "review-group://revision-1",
            diffFilePath: "src/app.ts",
            line: undefined,
            revisionGuid: "revision-1",
          }),
        ],
        activeTabId: "review-group:review-group://revision-1:revision-1",
      },
    });

    expect(JSON.stringify(props.source)).not.toContain("undefined");
    expect(Object.prototype.hasOwnProperty.call(props.source.tabs[0], "line")).toBe(false);
  });

  it("selects a neighboring tab when removing the active center tab", () => {
    const first = createCanvasCenterTab({
      kind: "file",
      path: "/repo/a.ts",
      mode: "edit",
    });
    const second = createCanvasCenterTab({
      kind: "file",
      path: "/repo/b.ts",
      mode: "edit",
    });

    const result = removeCanvasCenterTab([first, second], second.id, second.id);

    expect(result.tabs).toEqual([first]);
    expect(result.activeTabId).toBe(first.id);
  });
});
