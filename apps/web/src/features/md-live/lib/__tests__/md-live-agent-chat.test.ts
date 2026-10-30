import { describe, expect, test } from "bun:test";
import {
  isMdLiveBarHoverZone,
  mdLiveAgentChatInstanceKey,
  mdLiveOverlayTitle,
  mdLiveSelectionPopoverStyle,
  MD_LIVE_AGENT_SKILL_PATH,
  MD_LIVE_BAR_HOVER_PX,
  nextMdLiveBarMode,
  transformMdLivePrompt,
} from "../md-live-agent-chat";

describe("md-live agent chat helpers", () => {
  test("session instance key is stable per file path", () => {
    expect(mdLiveAgentChatInstanceKey("/tmp/note.md")).toBe("md-live:/tmp/note.md");
    expect(mdLiveAgentChatInstanceKey("/tmp/note.md")).toBe(
      mdLiveAgentChatInstanceKey("/tmp/note.md"),
    );
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
});
