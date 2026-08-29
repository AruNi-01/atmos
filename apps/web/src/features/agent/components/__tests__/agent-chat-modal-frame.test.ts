import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const panel = readFileSync(
  join(import.meta.dir, "../AgentChatPanel.tsx"),
  "utf8",
);

describe("agent chat modal frame", () => {
  it("drags and resizes through the DOM, then commits layout once", () => {
    const dragStart = panel.indexOf("const handleDragStart");
    const resizeStart = panel.indexOf("const handleResizeStart");
    const resizeCleanup = panel.indexOf("useEffect(() => {\n    return () => {\n      if (frameRafRef.current != null)");
    const drag = panel.slice(dragStart, resizeStart);
    const resize = panel.slice(resizeStart, resizeCleanup);

    expect(drag).toContain("scheduleModalFrame");
    expect(drag).toContain("commitModalFrame");
    expect(drag).not.toContain("updateLayout(");

    expect(resize).toContain("scheduleModalFrame");
    expect(resize).toContain("commitModalFrame");
    expect(resize).not.toContain("updateLayout(");

    expect(panel).toContain("translate3d");
    expect(panel).toContain("willChange: \"transform\"");
  });

  it("pins the composer while the transcript and permission card scroll", () => {
    expect(panel).toContain('<div className="flex min-h-0 shrink-0 flex-col">');
    expect(panel).toContain("max-h-[40vh] shrink overflow-y-auto overscroll-contain");
    expect(panel).toContain('className={cn("shrink-0", wideContentClassName)}');
    expect(panel).toContain("<AgentPromptComposer");
  });
});
