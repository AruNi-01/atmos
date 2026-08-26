import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CENTER_SPACE_ID,
  DEFAULT_CENTER_SPACE_NAME,
  centerSpaceSlideDirection,
  neighborSpaceIdAfterDelete,
  omitCenterSpaceThumbnails,
} from "@/app-shell/center-space/center-space";
import { CENTER_SPACE_SLIDE_MS } from "@/app-shell/center-space/center-space-slide";
import {
  CENTER_SPACE_FAN_MS,
  CENTER_SPACE_FAN_ROTATION,
  CENTER_SPACE_FAN_SPREAD,
  centerSpaceFanCssVars,
  centerSpaceFanPose,
  centerSpaceFanStageWidth,
} from "@/app-shell/center-space/center-space-fan";

const dir = join(import.meta.dir, "..");

describe("center space switcher open path", () => {
  it("starts a cheap preview on hover and never waits for it before fanning", () => {
    const switcher = readFileSync(
      join(dir, "center-space/CenterSpaceSwitcher.tsx"),
      "utf8",
    );
    expect(switcher).toContain("onPointerEnter={handlePointerEnter}");
    expect(switcher).toContain("onPointerLeave={handlePointerLeave}");
    expect(switcher).toContain("onFocus={handlePointerEnter}");
    expect(switcher).toContain("schedulePreview");
    expect(switcher).toContain("requestIdleCallback");
    expect(switcher).toContain("void ensurePreview(true)");
    expect(switcher).not.toContain("await ensurePreview()");
    expect(switcher).toContain("prefetchCenterSpaceSnapdom");
    expect(switcher).toContain("previewReadyRef.current = Boolean(");
    expect(switcher).toContain("useCenterStageLastTab");
    expect(switcher).toContain("captureActiveCenterSpaceThumbnail");
    expect(switcher).toContain("allowIdleCaptureRef");
    expect(switcher).toContain("previewReadyRef.current = false");
    expect(switcher).toContain("refreshActiveCenterSpacePreview");
    expect(switcher).toContain("bg-emerald-500");
    expect(switcher).toContain("agent-attention-ring-card");
    expect(switcher).toContain("offActiveSpaceAttentionReason");
    expect(switcher).toContain("hostSpaceAttentionReasons");
    const enterAt = switcher.indexOf("const handlePointerEnter");
    const toggleAt = switcher.indexOf("const handleToggleOpen");
    const enterBody = switcher.slice(enterAt, toggleAt);
    expect(enterBody).toContain("schedulePreview()");
    expect(enterBody).not.toContain("ensurePreview()");
    expect(switcher).not.toContain("motion/react");
    expect(switcher).not.toContain("captureCurrentPreview");
    const openAt = switcher.indexOf("setOpen(true)", toggleAt);
    const captureAt = switcher.indexOf("void ensurePreview(true)", toggleAt);
    expect(openAt).toBeGreaterThan(toggleAt);
    expect(captureAt).toBeGreaterThan(openAt);
  });

  it("captures the live frame with snapdom instead of cloning via html2canvas", () => {
    const thumb = readFileSync(
      join(dir, "center-space/center-space-thumbnail.ts"),
      "utf8",
    );
    expect(thumb).toContain('@zumer/snapdom');
    expect(thumb).toContain("snapdom.toCanvas");
    expect(thumb).toContain("burst: true");
    expect(thumb).toContain("queryCenterWorkArea");
    expect(thumb).toContain("data-center-stage-body");
    expect(thumb).toContain("coverDest");
    expect(thumb).toContain("opaqueBackground");
    expect(thumb).toContain("shouldKeepSnapPreviewNode");
    expect(thumb).toContain("paintXtermBufferInto");
    expect(thumb).toContain("listXtermPreviewHosts");
    expect(thumb).toContain("snapshotMountedCenterSpaceThumbnails");
    expect(thumb).toContain("data-workspace-frame");
    expect(thumb).toContain("THUMB_WIDTH = 136");
    expect(thumb).not.toContain("document.readyState");
    expect(thumb).not.toContain("html2canvas");
    expect(thumb).not.toContain("html-to-image");
    expect(thumb).not.toContain("use-react-screenshot");
    expect(thumb).not.toContain("react-screen-capture");
    expect(thumb).not.toContain("skipFonts");
    expect(thumb).not.toContain("includeStyleProperties");
    expect(thumb).not.toContain("yieldToIdle");
    expect(thumb).not.toContain("THUMB_WIDTH = 96");
    const preview = readFileSync(
      join(dir, "center-space/CenterSpacePreview.tsx"),
      "utf8",
    );
    expect(preview).toContain("paintCenterSpaceTerminalOverlay");
    expect(preview).toContain("setInterval");
    const switcher = readFileSync(
      join(dir, "center-space/CenterSpaceSwitcher.tsx"),
      "utf8",
    );
    expect(switcher).toContain("CenterSpacePreview");
    expect(switcher).toContain("live={open && selected}");
    expect(preview).toContain("object-contain");
    expect(preview).toContain("queryCenterWorkArea");
  });

  it("cascades space delete through pane, run, tmux, and chrome state", () => {
    const cleanup = readFileSync(
      join(dir, "center-space/center-space-cleanup.ts"),
      "utf8",
    );
    expect(cleanup).toContain("killExtraSpaceTmuxWindows");
    expect(cleanup).toContain("extraCenterSpaceTmuxWindowPrefix");
    expect(cleanup).toContain("listTmuxWindows");
    expect(cleanup).toContain("killTmuxWindow");
    expect(cleanup).toContain("detachWorkspaceFrontend");
    expect(cleanup).toContain("forgetPaintContextUiPrefs");
    expect(cleanup).toContain("clearAgentLastSession");
    expect(cleanup).toContain("clearCenterTabActivationStack");
    expect(cleanup).toContain("forgetContext");
    expect(cleanup).toContain('freeze(paintContextId, "manual")');
    const runScript = readFileSync(
      join(dir, "../features/browser/components/RunScript.tsx"),
      "utf8",
    );
    expect(runScript).toContain("namespacedTmuxWindowName");
    expect(runScript).toContain("hostIdFromCenterKey");
    expect(runScript).toContain("tmuxWindowName={runWindowName(tab.id)}");
    const frame = readFileSync(join(dir, "workspace-center-frame.tsx"), "utf8");
    const runBlock = frame.slice(frame.indexOf("<KeptRunScript"));
    expect(runBlock).toContain("workspaceId={isUrlSyncedActive ? contextId : null}");
    expect(runBlock).not.toContain("currentWorkspace?.id");
  });

  it("asks for popover confirmation before deleting a space", () => {
    const switcher = readFileSync(
      join(dir, "center-space/CenterSpaceSwitcher.tsx"),
      "utf8",
    );
    expect(switcher).toContain("confirmDeleteId");
    expect(switcher).toContain("deleteConfirmTitle");
    expect(switcher).toContain("deleteConfirmAction");
    expect(switcher).toContain("PopoverContent");
    expect(switcher).toContain("data-confirming");
    const triggerAt = switcher.indexOf("aria-label={t(\"deleteSpace\"");
    const confirmAt = switcher.indexOf("void deleteCenterSpace(hostId, space.id)");
    expect(triggerAt).toBeGreaterThan(0);
    expect(confirmAt).toBeGreaterThan(triggerAt);
    const triggerClick = switcher.slice(triggerAt, confirmAt);
    expect(triggerClick).not.toContain("deleteCenterSpace");
    expect(switcher.match(/deleteCenterSpace/g)?.length).toBe(2);
  });

  it("fans with compositor transforms instead of js springs", () => {
    const css = readFileSync(join(dir, "center-space/center-space-fan.css"), "utf8");
    expect(css).toContain("translate3d(var(--fan-x), var(--fan-y), 0)");
    expect(css).toContain('.center-space-fan-card[data-confirming="true"]');
    expect(css).toContain("will-change: transform, opacity");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(`${CENTER_SPACE_FAN_MS}ms`);
    expect(css).toContain("rotate(var(--fan-rotate))");
    const pose = centerSpaceFanPose(0, 3, true);
    expect(CENTER_SPACE_FAN_SPREAD).toBe(99);
    expect(CENTER_SPACE_FAN_ROTATION).toBe(20);
    expect(pose.x).toBe(-CENTER_SPACE_FAN_SPREAD);
    expect(pose.rotate).toBe(-CENTER_SPACE_FAN_ROTATION);
    expect(centerSpaceFanPose(2, 3, true).x).toBe(CENTER_SPACE_FAN_SPREAD);
    expect(centerSpaceFanStageWidth(3)).toBeGreaterThan(360);
    const vars = centerSpaceFanCssVars(pose);
    expect(vars["--fan-x"]).toBe(`${pose.x}px`);
    expect(centerSpaceFanPose(1, 3, false).opacity).toBe(0);
  });

  it("crossfades the whole center card instead of per-frame push-page classes", () => {
    const switcherSrc = readFileSync(
      join(dir, "center-space/center-space-switch.ts"),
      "utf8",
    );
    expect(switcherSrc).toContain("runCenterSpaceSlide");
    expect(switcherSrc).toContain("clearCenterDeepLinkUrl");
    expect(switcherSrc).toContain("!current.spaces.some((space) => space.id === spaceId)");
    expect(switcherSrc).toContain('"forward"');
    const stage = readFileSync(join(dir, "CenterStage.tsx"), "utf8");
    expect(stage).toContain("switchCenterSpace(liveHostContextId, targetSpaceId, {");
    expect(stage).toContain("preserveDeepLink: true");
    expect(switcherSrc).toContain("preserveDeepLink");
    expect(stage).toContain("spaceIdFromTmuxWindowName");
    const spaceSwitchAt = stage.indexOf("switchCenterSpace(liveHostContextId, targetSpaceId");
    const paneFocusAt = stage.indexOf("focusPaneByTmuxAcrossAllTabs(tmux)");
    expect(spaceSwitchAt).toBeGreaterThan(0);
    expect(paneFocusAt).toBeGreaterThan(spaceSwitchAt);
    const tabBar = readFileSync(join(dir, "CenterStageTabBar.tsx"), "utf8");
    expect(tabBar).toContain("stableAgentPaneId");
    const stageTabs = readFileSync(join(dir, "center-stage-tabs.tsx"), "utf8");
    expect(stageTabs).toContain("stableAgentPaneId");
    expect(switcherSrc).toContain('"back"');
    const createAt = switcherSrc.indexOf("export async function openNewCenterSpace");
    const switchAt = switcherSrc.indexOf("export async function switchCenterSpace");
    const createBody = switcherSrc.slice(createAt, switchAt);
    expect(createBody).toContain('runCenterSpaceSlide("forward"');
    expect(createBody).not.toContain("captureActiveCenterSpaceThumbnail");
    expect(switcherSrc).not.toContain("useCenterSpaceSlideStore");
    const frame = readFileSync(join(dir, "workspace-center-frame.tsx"), "utf8");
    expect(frame).not.toContain("push-page-slide-in-x");
    expect(frame).not.toContain("push-page-slide-out-x");
    const css = readFileSync(
      join(import.meta.dir, "../../app/globals.css"),
      "utf8",
    );
    expect(css).toContain("center-space-card");
    expect(css).toContain("center-space-incoming");
    expect(css).toContain("center-space-outgoing");
    expect(css).toContain("space-shrink-out");
    expect(css).toContain("space-zoom-out");
    expect(css).toContain("space-zoom-in");
    expect(css).toContain("scale(0.86)");
    expect(css).not.toContain("scale(1.12)");
    expect(css).toContain(`${CENTER_SPACE_SLIDE_MS}ms`);
    expect(css).not.toContain("space-slide-to-left");
    expect(css).not.toContain("space-slide-from-right");
    expect(css.indexOf("::view-transition-old(*)")).toBeGreaterThan(0);
    expect(css.indexOf("::view-transition-old(center-space-card)")).toBeGreaterThan(
      css.indexOf("::view-transition-old(*)"),
    );
    expect(css).toContain("agent-attention-card-border-pulse");
    expect(css).toContain("agent-attention-ring-card");
    const slideSrc = readFileSync(join(dir, "center-space/center-space-slide.ts"), "utf8");
    expect(slideSrc).toContain("doc.startViewTransition(update)");
    expect(slideSrc).toContain("INCOMING_VT_NAME");
    expect(slideSrc).toContain("OUTGOING_VT_NAME");
    expect(slideSrc).toContain("fromCard");
    expect(slideSrc).not.toContain("return start(update)");
    const switcher = readFileSync(
      join(dir, "center-space/CenterSpaceSwitcher.tsx"),
      "utf8",
    );
    expect(switcher).toContain("fromCard");
    expect(switcher).toContain("onPaint: () => closeFan({ immediate: true })");
    expect(switcher).toContain("data-center-space-fan-card");
    const spaces = [
      { id: "main" },
      { id: "space-1" },
      { id: "space-2" },
    ];
    expect(centerSpaceSlideDirection(spaces, "main", "space-2")).toBe("forward");
    expect(centerSpaceSlideDirection(spaces, "space-2", "main")).toBe("back");
    expect(neighborSpaceIdAfterDelete(
      [
        {
          id: DEFAULT_CENTER_SPACE_ID,
          name: DEFAULT_CENTER_SPACE_NAME,
          createdAt: 1,
          updatedAt: 1,
        },
        { id: "space-1", name: "Space 1", createdAt: 1, updatedAt: 1 },
        { id: "space-2", name: "Space 2", createdAt: 1, updatedAt: 1 },
      ],
      "space-2",
    )).toBe("space-1");
  });

  it("keeps jpeg thumbnails in the local cache and strips them for disk writes", () => {
    const storeSrc = readFileSync(join(dir, "center-space/center-space-store.ts"), "utf8");
    const persistSrc = readFileSync(join(dir, "center-layout/center-layout-persist.ts"), "utf8");
    const documentSrc = readFileSync(
      join(dir, "center-layout/center-layout-document.ts"),
      "utf8",
    );
    expect(storeSrc).toContain("markCenterLayoutDirty({ disk: false })");
    expect(documentSrc).toContain("omitCenterSpaceThumbnails");
    expect(persistSrc).toContain("toCenterLayoutWire");
    expect(persistSrc).not.toContain("function_settings");
    const setThumbAt = storeSrc.indexOf("setThumbnails: (hostId, thumbs)");
    const renameAt = storeSrc.indexOf("renameSpace: (hostId, spaceId, name)", setThumbAt);
    expect(setThumbAt).toBeGreaterThan(0);
    expect(storeSrc.slice(setThumbAt, renameAt)).toContain("markCenterLayoutDirty({ disk: false })");

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
