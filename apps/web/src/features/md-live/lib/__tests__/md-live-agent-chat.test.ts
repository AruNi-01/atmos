import { describe, expect, test } from "bun:test";
import {
  isMdLiveAgentOverlayDismissTarget,
  isMdLiveInviteHoverTarget,
  mdLiveAgentChatInstanceKey,
  mdLiveAgentChromeStep,
  mdLiveOverlayTitle,
  mdLiveSelectionPopoverStyle,
  mdLiveIdleWorkedMs,
  mdLiveShowThreadCard,
  mdLiveShowWorkingPill,
  MD_LIVE_AGENT_CHAT_SOURCE,
  MD_LIVE_AGENT_CHROME_MAX_MODE_LABEL_PX,
  MD_LIVE_AGENT_CHROME_MAX_MODEL_TEXT_PX,
  MD_LIVE_AGENT_CHROME_MAX_PERMISSION_LABEL_PX,
  MD_LIVE_AGENT_CHROME_MAX_THREAD_PX,
  MD_LIVE_AGENT_SKILL_PATH,
  MD_LIVE_BAR_COLLAPSE_EASE,
  MD_LIVE_BAR_COLLAPSE_MORPH_S,
  MD_LIVE_BAR_EXPAND_EASE,
  MD_LIVE_BAR_MORPH_S,
  MD_LIVE_INVITE_BOTTOM_PX,
  MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX,
  MD_LIVE_INVITE_HAIRLINE_HIT_ABOVE_PX,
  MD_LIVE_INVITE_HAIRLINE_WIDTH_PX,
  MD_LIVE_INVITE_HAIRLINE_Y_PX,
  MD_LIVE_INVITE_HOVER_LEAVE_MS,
  MD_LIVE_INVITE_HOVER_SELECTOR,
  MD_LIVE_INVITE_LABEL_COLLAPSE_SCALE,
  MD_LIVE_INVITE_LAYOUT_ID,
  MD_LIVE_INVITE_PILL_HEIGHT_PX,
  MD_LIVE_INVITE_COMPOSER_RADIUS_PX,
  MD_LIVE_INVITE_SHELL_RADIUS_PX,
  MD_LIVE_POPOVER_WIDTH,
  mdLiveBarMorphTransition,
  mdLiveBarSurface,
  mdLiveInviteAfterClickOutside,
  mdLiveInviteBoxContains,
  mdLiveInviteCollapseFrame,
  mdLiveInviteComposerCollapseFrame,
  mdLiveInviteFrameIsEmptyCapsule,
  mdLiveInviteHairlineGapFromBottomPx,
  mdLiveInviteHairlineHitBox,
  mdLiveInviteComposerRadiusMatchesAgentChat,
  mdLiveInviteHairlinePillNearSquare,
  mdLiveInviteHoverContainsHairline,
  mdLiveInviteMorphIsMonotonicShrink,
  mdLiveInviteMorphKeyframes,
  mdLiveInviteMorphRadiusPx,
  mdLiveInviteMorphs,
  mdLiveInvitePaintComposer,
  mdLiveInviteShellBox,
  mdLiveInviteShellRadiusIsCapsule,
  mdLiveInviteShellRadiusPx,
  mdLiveInviteShowsMessageAgentLabel,
  nextMdLiveBarMode,
  transformMdLivePrompt,
} from "../md-live-agent-chat";

describe("md-live agent chat helpers", () => {
  test("session instance key is stable per file path", () => {
    expect(mdLiveAgentChatInstanceKey("/tmp/note.md")).toBe("md-live:/tmp/note.md");
    expect(mdLiveAgentChatInstanceKey("/tmp/note.md")).toBe(
      mdLiveAgentChatInstanceKey("/tmp/note.md"),
    );
    expect(MD_LIVE_AGENT_CHAT_SOURCE).toBe("md-live");
  });

  test("hover shows the Message Agent pill instead of the composer", () => {
    const base = {
      popover: false,
      hover: false,
      focused: false,
      hasDraft: false,
      expanded: false,
      working: false,
    };
    expect(nextMdLiveBarMode(base)).toBe("hidden");
    expect(mdLiveBarSurface(nextMdLiveBarMode(base), false)).toBe("hidden");
    for (let cycle = 0; cycle < 5; cycle += 1) {
      expect(nextMdLiveBarMode({ ...base, hover: true })).toBe("invite");
      expect(nextMdLiveBarMode({ ...base, hover: false })).toBe("hidden");
    }
    expect(nextMdLiveBarMode({ ...base, hover: true })).toBe("invite");
    expect(mdLiveBarSurface("invite", false)).toBe("invite");
    expect(mdLiveBarSurface("invite", false)).not.toBe("composer");
    expect(nextMdLiveBarMode({ ...base, focused: true })).toBe("focused");
    expect(mdLiveBarSurface("focused", false)).toBe("composer");
    expect(nextMdLiveBarMode({ ...base, hasDraft: true })).toBe("focused");
    expect(nextMdLiveBarMode({ ...base, working: true })).toBe("collapsed");
    expect(mdLiveBarSurface("collapsed", false)).toBe("status");
    expect(nextMdLiveBarMode({ ...base, hover: true, working: true })).toBe("collapsed");
    expect(nextMdLiveBarMode({ ...base, expanded: true, working: true })).toBe("expanded");
    expect(mdLiveBarSurface("expanded", false)).toBe("composer");
    expect(nextMdLiveBarMode({ ...base, popover: true, expanded: true })).toBe("hidden");
    expect(mdLiveBarSurface("hidden", true)).toBe("composer");
    expect(nextMdLiveBarMode({ ...base, hasThread: true })).toBe("collapsed");
    expect(nextMdLiveBarMode({ ...base, reviewPending: true })).toBe("collapsed");
    expect(MD_LIVE_INVITE_LAYOUT_ID).toBe("md-live-invite-shell");
    expect(MD_LIVE_BAR_MORPH_S).toBe(0.32);
    expect(MD_LIVE_INVITE_HAIRLINE_WIDTH_PX).toBe(104);
    expect(MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX).toBe(4);
    expect(MD_LIVE_INVITE_HAIRLINE_WIDTH_PX).toBeGreaterThanOrEqual(96);
    expect(MD_LIVE_INVITE_HAIRLINE_WIDTH_PX).toBeLessThanOrEqual(112);
    expect(MD_LIVE_INVITE_HAIRLINE_WIDTH_PX).toBeLessThan(MD_LIVE_INVITE_PILL_HEIGHT_PX * 4);
    expect(MD_LIVE_INVITE_PILL_HEIGHT_PX).toBe(36);
    expect(MD_LIVE_INVITE_HAIRLINE_Y_PX).toBe(0);
    expect(MD_LIVE_INVITE_BOTTOM_PX).toBeGreaterThanOrEqual(16);
    expect(mdLiveInviteHairlineGapFromBottomPx()).toBeGreaterThanOrEqual(16);
    expect(mdLiveInviteHairlineGapFromBottomPx()).toBeGreaterThan(
      mdLiveInviteHairlineGapFromBottomPx(12, 8),
    );
    expect(MD_LIVE_INVITE_HOVER_LEAVE_MS).toBeLessThanOrEqual(80);
    expect(MD_LIVE_INVITE_HOVER_SELECTOR).toContain("data-md-live-invite-hairline");
    expect(mdLiveInviteMorphs("hidden", { showThreadCard: false, hasComposerChrome: false })).toBe(
      true,
    );
    expect(mdLiveInviteMorphs("invite", { showThreadCard: false, hasComposerChrome: false })).toBe(
      true,
    );
    expect(
      mdLiveInviteMorphs("composer", { showThreadCard: false, hasComposerChrome: false }),
    ).toBe(true);
    expect(mdLiveInviteMorphs("composer", { showThreadCard: true, hasComposerChrome: false })).toBe(
      false,
    );
    expect(mdLiveInviteMorphs("status", { showThreadCard: false, hasComposerChrome: true })).toBe(
      false,
    );
  });

  test("Working stays visible without hover so the pill can expand/minimize", () => {
    expect(
      nextMdLiveBarMode({
        popover: false,
        hover: false,
        focused: false,
        hasDraft: false,
        expanded: false,
        working: true,
      }),
    ).toBe("collapsed");
    expect(
      nextMdLiveBarMode({
        popover: false,
        hover: false,
        focused: false,
        hasDraft: false,
        expanded: true,
        working: true,
      }),
    ).toBe("expanded");
  });

  test("popover anchors to the bottom-right of the selection", () => {
    const style = mdLiveSelectionPopoverStyle(
      { left: 200, top: 40, right: 360, bottom: 88, width: 160, height: 48 },
      320,
      1280,
    );
    expect(style.top).toBe(96);
    expect(style.left).toBe(40);
  });

  test("prompt injects edit-tool contract and forbids fs_write of the doc", () => {
    const prompt = transformMdLivePrompt({
      prompt: "Tighten this paragraph.",
      filePath: "/repo/README.md",
      invokeUrl: "http://127.0.0.1:30303/api/md-live/agent/invoke",
      clientId: "md-live:/repo/README.md",
      selection: "hello",
    });
    expect(prompt.startsWith("Tighten this paragraph.")).toBe(true);
    expect(prompt).toContain("md_live_replace_selection");
    expect(prompt).toContain("/api/md-live/agent/invoke");
    expect(prompt).toContain("Do not use fs_write");
    expect(prompt).toContain(MD_LIVE_AGENT_SKILL_PATH);
    expect(prompt).toContain("Do not only reply with rewritten text");
  });

  test("overlay title ignores injected Live contract lines", () => {
    expect(mdLiveOverlayTitle("You are editing the open Atmos Live markdown document.", "")).toBe(
      "",
    );
    expect(
      mdLiveOverlayTitle(
        "Rewrite the selected markdown in place using md_live_replace_selection.",
        "",
      ),
    ).toBe("");
    expect(mdLiveOverlayTitle("Tighten this paragraph.", "")).toBe("Tighten this paragraph.");
    expect(mdLiveOverlayTitle(null, "")).toBe("");
  });

  test("hairline sits inside the pill so a still pointer cannot leave on expand", () => {
    const pillWidth = 148;
    const viewport = {
      viewportWidth: 800,
      viewportHeight: 600,
      pillWidthPx: pillWidth,
    };
    expect(mdLiveInviteHoverContainsHairline(pillWidth)).toBe(true);

    const oldHairline = mdLiveInviteHairlineHitBox(
      mdLiveInviteShellBox({
        surface: "hidden",
        ...viewport,
        bottomPx: 12,
        hairlineYPx: 8,
      }),
    );
    const oldPill = mdLiveInviteShellBox({
      surface: "invite",
      ...viewport,
      bottomPx: 12,
      hairlineYPx: 8,
    });
    const oldCenter = {
      x: (oldHairline.left + oldHairline.right) / 2,
      y: (oldHairline.top + oldHairline.bottom) / 2,
    };
    expect(mdLiveInviteBoxContains(oldPill, oldCenter)).toBe(false);

    const nextHairline = mdLiveInviteShellBox({ surface: "hidden", ...viewport });
    expect(viewport.viewportHeight - nextHairline.bottom).toBe(MD_LIVE_INVITE_BOTTOM_PX);
    expect(MD_LIVE_INVITE_HAIRLINE_HIT_ABOVE_PX).toBe(8);
  });

  test("collapse morph is a one-step shrink, not pill-then-hairline", () => {
    const sizes = { pillWidthPx: 148, composerWidthPx: 672, composerHeightPx: 120 };
    expect(mdLiveInviteMorphKeyframes("composer", "hidden", sizes)).toEqual([
      { width: 672, height: 120 },
      { width: MD_LIVE_INVITE_HAIRLINE_WIDTH_PX, height: MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX },
    ]);
    expect(mdLiveInviteMorphIsMonotonicShrink("composer", "hidden", sizes)).toBe(true);
    expect(mdLiveInviteMorphIsMonotonicShrink("invite", "hidden", sizes)).toBe(true);
    const collapse = mdLiveBarMorphTransition("collapse");
    const expand = mdLiveBarMorphTransition("expand");
    expect(collapse.type).toBe("tween");
    expect(expand.type).toBe("tween");
    expect(collapse.ease).toEqual(MD_LIVE_BAR_COLLAPSE_EASE);
    expect(expand.ease).toEqual(MD_LIVE_BAR_EXPAND_EASE);
    expect(collapse.duration).toBe(MD_LIVE_BAR_COLLAPSE_MORPH_S);
    expect(collapse.height.duration).toBe(collapse.width.duration);
    expect(collapse.opacity.duration).toBe(collapse.width.duration);
    expect(collapse.scale.duration).toBe(collapse.height.duration);
    expect(collapse.opacity.ease).toEqual(collapse.width.ease);
    expect(collapse.scale.ease).toEqual(collapse.height.ease);
    expect(collapse.borderRadius.duration).toBe(0);
    expect(expand.borderRadius.duration).toBe(0);
    expect(collapse.ease[1]).toBeGreaterThanOrEqual(0);
    expect(collapse.ease[1]).toBeLessThanOrEqual(1);
    expect(collapse.ease[3]).toBeGreaterThanOrEqual(0);
    expect(collapse.ease[3]).toBeLessThanOrEqual(1);
  });

  test("pill collapse decays label and shell on the same clock", () => {
    const pill = 148;
    expect(
      mdLiveInviteFrameIsEmptyCapsule(
        { width: pill, height: MD_LIVE_INVITE_PILL_HEIGHT_PX, labelOpacity: 0 },
        pill,
      ),
    ).toBe(true);
    expect(MD_LIVE_INVITE_LABEL_COLLAPSE_SCALE).toBe(
      MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX / MD_LIVE_INVITE_PILL_HEIGHT_PX,
    );
    for (const progress of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.88, 0.9, 1]) {
      const frame = mdLiveInviteCollapseFrame(progress, pill);
      expect(frame.labelOpacity).toBeCloseTo(1 - progress, 8);
      expect(frame.labelScale).toBeCloseTo(
        1 + (MD_LIVE_INVITE_LABEL_COLLAPSE_SCALE - 1) * progress,
        8,
      );
      expect(frame.width).toBeCloseTo(
        pill + (MD_LIVE_INVITE_HAIRLINE_WIDTH_PX - pill) * progress,
        8,
      );
      expect(frame.height).toBeCloseTo(
        MD_LIVE_INVITE_PILL_HEIGHT_PX +
          (MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX - MD_LIVE_INVITE_PILL_HEIGHT_PX) * progress,
        8,
      );
      expect(mdLiveInviteFrameIsEmptyCapsule(frame, pill)).toBe(false);
      expect(frame.borderRadius).toBe(MD_LIVE_INVITE_SHELL_RADIUS_PX);
      expect(mdLiveInviteShellRadiusIsCapsule(frame.borderRadius, frame.height)).toBe(true);
      expect(mdLiveInviteHairlinePillNearSquare(frame.borderRadius, frame.height)).toBe(false);
    }
  });

  test("pill morph keeps a capsule corner radius at every height", () => {
    expect(MD_LIVE_INVITE_SHELL_RADIUS_PX).toBe(9999);
    expect(MD_LIVE_INVITE_COMPOSER_RADIUS_PX).toBe(22);
    expect(mdLiveInviteShellRadiusPx("hidden")).toBe(MD_LIVE_INVITE_SHELL_RADIUS_PX);
    expect(mdLiveInviteShellRadiusPx("invite")).toBe(MD_LIVE_INVITE_SHELL_RADIUS_PX);
    expect(mdLiveInviteShellRadiusPx("composer")).toBe(MD_LIVE_INVITE_COMPOSER_RADIUS_PX);
    expect(mdLiveInviteComposerRadiusMatchesAgentChat(MD_LIVE_INVITE_COMPOSER_RADIUS_PX)).toBe(
      true,
    );
    expect(mdLiveInviteComposerRadiusMatchesAgentChat(MD_LIVE_INVITE_SHELL_RADIUS_PX)).toBe(false);
    for (const height of [
      MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX,
      12,
      20,
      MD_LIVE_INVITE_PILL_HEIGHT_PX,
      120,
    ]) {
      expect(mdLiveInviteShellRadiusIsCapsule(MD_LIVE_INVITE_SHELL_RADIUS_PX, height)).toBe(true);
      expect(mdLiveInviteHairlinePillNearSquare(MD_LIVE_INVITE_SHELL_RADIUS_PX, height)).toBe(
        false,
      );
    }
    expect(mdLiveInviteShellRadiusIsCapsule(16, 36)).toBe(false);
    expect(mdLiveInviteShellRadiusIsCapsule(8, 20)).toBe(false);
    expect(mdLiveInviteHairlinePillNearSquare(16, 36)).toBe(true);
    expect(mdLiveInviteHairlinePillNearSquare(8, 20)).toBe(true);
    expect(mdLiveInviteHairlinePillNearSquare(MD_LIVE_INVITE_COMPOSER_RADIUS_PX, 120)).toBe(false);
    expect(mdLiveInviteShellRadiusIsCapsule(MD_LIVE_INVITE_COMPOSER_RADIUS_PX, 120)).toBe(false);
  });

  test("settled composer uses Agent Chat 3xl and pill morph never interpolates it", () => {
    expect(mdLiveInviteMorphRadiusPx("hidden", "invite")).toBe(MD_LIVE_INVITE_SHELL_RADIUS_PX);
    expect(mdLiveInviteMorphRadiusPx("invite", "hidden")).toBe(MD_LIVE_INVITE_SHELL_RADIUS_PX);
    expect(mdLiveInviteMorphRadiusPx("invite", "composer")).toBe(MD_LIVE_INVITE_COMPOSER_RADIUS_PX);
    expect(mdLiveInviteMorphRadiusPx("composer", "hidden")).toBe(MD_LIVE_INVITE_COMPOSER_RADIUS_PX);
    expect(mdLiveInviteMorphRadiusPx("hidden", "composer")).toBe(MD_LIVE_INVITE_COMPOSER_RADIUS_PX);
    const pillWidth = 148;
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const pillFrame = mdLiveInviteCollapseFrame(progress, pillWidth);
      expect(mdLiveInviteMorphRadiusPx("invite", "hidden")).toBe(pillFrame.borderRadius);
      expect(mdLiveInviteHairlinePillNearSquare(pillFrame.borderRadius, pillFrame.height)).toBe(
        false,
      );
    }
    const composerOpen = mdLiveInviteComposerCollapseFrame(0, 672, 120);
    expect(mdLiveInviteComposerRadiusMatchesAgentChat(composerOpen.borderRadius)).toBe(true);
    expect(mdLiveInviteShellRadiusIsCapsule(composerOpen.borderRadius, composerOpen.height)).toBe(
      false,
    );
    expect(mdLiveInviteHairlinePillNearSquare(composerOpen.borderRadius, composerOpen.height)).toBe(
      false,
    );
  });

  test("click-outside from composer skips the Message Agent invite", () => {
    const empty = { hasDraft: false, working: false };
    expect(mdLiveInviteAfterClickOutside(empty)).toBe("hidden");
    expect(mdLiveBarSurface(mdLiveInviteAfterClickOutside(empty), false)).toBe("hidden");
    expect(mdLiveInviteAfterClickOutside(empty)).not.toBe("invite");
    expect(mdLiveInviteShowsMessageAgentLabel("hidden", "composer")).toBe(false);
    expect(mdLiveInviteShowsMessageAgentLabel("hidden", "invite")).toBe(true);
    expect(mdLiveInviteShowsMessageAgentLabel("invite", null)).toBe(true);
    expect(mdLiveInviteShowsMessageAgentLabel("composer", null)).toBe(false);
    expect(mdLiveInvitePaintComposer("composer", null)).toBe(true);
    expect(mdLiveInvitePaintComposer("hidden", "composer")).toBe(true);
    expect(mdLiveInvitePaintComposer("hidden", "invite")).toBe(false);
    expect(mdLiveInvitePaintComposer("hidden", null)).toBe(false);
    expect(
      nextMdLiveBarMode({
        popover: false,
        hover: true,
        focused: false,
        hasDraft: false,
        expanded: false,
        working: false,
      }),
    ).toBe("invite");
    expect(mdLiveInviteAfterClickOutside({ hasDraft: true, working: false })).toBe("focused");
    expect(mdLiveInviteAfterClickOutside({ hasDraft: false, working: true })).toBe("collapsed");
    const composerFrames = [0, 0.35, 0.72, 1].map((progress) =>
      mdLiveInviteComposerCollapseFrame(progress, 672, 120),
    );
    for (const frame of composerFrames) {
      expect(frame.messageAgentLabel).toBe(false);
      expect(frame.borderRadius).toBe(MD_LIVE_INVITE_COMPOSER_RADIUS_PX);
      expect(mdLiveInviteComposerRadiusMatchesAgentChat(frame.borderRadius)).toBe(true);
      expect(mdLiveInviteHairlinePillNearSquare(frame.borderRadius, frame.height)).toBe(false);
      expect(Math.abs(frame.width - 148) < 8 && Math.abs(frame.height - 36) < 4).toBe(false);
    }
    expect(
      mdLiveInviteShellRadiusIsCapsule(composerFrames[0]!.borderRadius, composerFrames[0]!.height),
    ).toBe(false);
  });

  test("invite hover only matches the hairline or capsule, not the dock", () => {
    expect(isMdLiveInviteHoverTarget(null)).toBe(false);
    expect(isMdLiveInviteHoverTarget({ closest: () => null } as unknown as EventTarget)).toBe(
      false,
    );
    expect(
      isMdLiveInviteHoverTarget({
        closest: (selector: string) => (selector === MD_LIVE_INVITE_HOVER_SELECTOR ? {} : null),
      } as unknown as EventTarget),
    ).toBe(true);
    expect(MD_LIVE_INVITE_HOVER_SELECTOR).toContain("data-md-live-invite-hairline");
    expect(MD_LIVE_INVITE_HOVER_SELECTOR).toContain("data-md-live-message-agent");
    expect(MD_LIVE_INVITE_HOVER_SELECTOR).toContain("data-md-live-invite-hit");
    expect(MD_LIVE_INVITE_HOVER_SELECTOR).not.toContain("data-md-live-agent-bar");
  });

  test("unpinned popover ignores overlay and portaled picker clicks", () => {
    const inside = { closest: () => null };
    const host = { contains: (node: Node) => node === (inside as unknown as Node) };
    expect(isMdLiveAgentOverlayDismissTarget(inside as unknown as EventTarget, host)).toBe(false);
    expect(
      isMdLiveAgentOverlayDismissTarget(
        {
          closest: (selector: string) =>
            selector.includes("data-morph-popover-portal") ? {} : null,
        } as unknown as EventTarget,
        { contains: () => false },
      ),
    ).toBe(false);
    expect(
      isMdLiveAgentOverlayDismissTarget({ closest: () => null } as unknown as EventTarget, {
        contains: () => false,
      }),
    ).toBe(true);
  });

  test("thread card appears only when the overlay has messages", () => {
    expect(mdLiveShowThreadCard({ popover: true, barExpanded: false, messageCount: 0 })).toBe(
      false,
    );
    expect(mdLiveShowThreadCard({ popover: true, barExpanded: false, messageCount: 1 })).toBe(true);
    expect(mdLiveShowThreadCard({ popover: false, barExpanded: true, messageCount: 2 })).toBe(true);
    expect(mdLiveShowThreadCard({ popover: false, barExpanded: false, messageCount: 3 })).toBe(
      false,
    );
  });

  test("status pill shows while busy or when a collapsed thread has messages", () => {
    expect(mdLiveShowWorkingPill({ showThreadCard: false, busy: true, messageCount: 0 })).toBe(
      true,
    );
    expect(mdLiveShowWorkingPill({ showThreadCard: false, busy: false, messageCount: 1 })).toBe(
      true,
    );
    expect(mdLiveShowWorkingPill({ showThreadCard: true, busy: true, messageCount: 2 })).toBe(
      false,
    );
    expect(mdLiveShowWorkingPill({ showThreadCard: false, busy: false, messageCount: 0 })).toBe(
      false,
    );
  });

  test("idle pill duration prefers elapsedMs then last assistant worked_ms", () => {
    expect(mdLiveIdleWorkedMs(12_000, [])).toBe(12_000);
    expect(
      mdLiveIdleWorkedMs(0, [{ role: "user" }, { role: "assistant", worked_ms: 467_000 }]),
    ).toBe(467_000);
    expect(mdLiveIdleWorkedMs(0, [{ role: "user" }])).toBe(0);
  });

  test("adaptive chrome hides Thread then model text then mode then permission", () => {
    expect(mdLiveAgentChromeStep(MD_LIVE_AGENT_CHROME_MAX_THREAD_PX + 1)).toBe("full");
    expect(mdLiveAgentChromeStep(MD_LIVE_AGENT_CHROME_MAX_THREAD_PX)).toBe("hide-thread");
    expect(mdLiveAgentChromeStep(MD_LIVE_AGENT_CHROME_MAX_MODEL_TEXT_PX + 1)).toBe("hide-thread");
    expect(mdLiveAgentChromeStep(MD_LIVE_AGENT_CHROME_MAX_MODEL_TEXT_PX)).toBe("model-icon");
    expect(mdLiveAgentChromeStep(MD_LIVE_POPOVER_WIDTH)).toBe("model-icon");
    expect(mdLiveAgentChromeStep(MD_LIVE_AGENT_CHROME_MAX_MODE_LABEL_PX + 1)).toBe("model-icon");
    expect(mdLiveAgentChromeStep(MD_LIVE_AGENT_CHROME_MAX_MODE_LABEL_PX)).toBe("mode-icon");
    expect(mdLiveAgentChromeStep(MD_LIVE_AGENT_CHROME_MAX_PERMISSION_LABEL_PX + 1)).toBe(
      "mode-icon",
    );
    expect(mdLiveAgentChromeStep(MD_LIVE_AGENT_CHROME_MAX_PERMISSION_LABEL_PX)).toBe(
      "permission-icon",
    );
  });
});
