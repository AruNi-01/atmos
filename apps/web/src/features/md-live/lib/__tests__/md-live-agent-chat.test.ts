import { describe, expect, test } from "bun:test";
import {
  isMdLiveAgentOverlayDismissTarget,
  isMdLiveBarHoverZone,
  mdLiveAgentChatInstanceKey,
  mdLiveAgentChromeStep,
  mdLiveOverlayTitle,
  mdLiveSelectionPopoverStyle,
  mdLiveShowThreadCard,
  MD_LIVE_AGENT_CHAT_SOURCE,
  MD_LIVE_AGENT_CHROME_MAX_MODE_LABEL_PX,
  MD_LIVE_AGENT_CHROME_MAX_MODEL_TEXT_PX,
  MD_LIVE_AGENT_CHROME_MAX_PERMISSION_LABEL_PX,
  MD_LIVE_AGENT_CHROME_MAX_THREAD_PX,
  MD_LIVE_AGENT_SKILL_PATH,
  MD_LIVE_BAR_HOVER_PX,
  MD_LIVE_POPOVER_WIDTH,
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

  test("one-line bar expands from hover to focus/draft to working thread", () => {
    const base = {
      popover: false,
      hover: false,
      focused: false,
      hasDraft: false,
      expanded: false,
      working: false,
    };
    expect(nextMdLiveBarMode(base)).toBe("hidden");
    expect(nextMdLiveBarMode({ ...base, hover: true })).toBe("collapsed");
    expect(nextMdLiveBarMode({ ...base, focused: true })).toBe("focused");
    expect(nextMdLiveBarMode({ ...base, hasDraft: true })).toBe("focused");
    expect(nextMdLiveBarMode({ ...base, working: true })).toBe("collapsed");
    expect(nextMdLiveBarMode({ ...base, expanded: true, working: true })).toBe("expanded");
    expect(nextMdLiveBarMode({ ...base, popover: true, expanded: true })).toBe("hidden");
    expect(nextMdLiveBarMode({ ...base, hasThread: true })).toBe("collapsed");
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

  test("hover zone is the bottom strip of the Live host", () => {
    expect(isMdLiveBarHoverZone(940, 1000)).toBe(true);
    expect(isMdLiveBarHoverZone(1000 - MD_LIVE_BAR_HOVER_PX - 1, 1000)).toBe(false);
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
