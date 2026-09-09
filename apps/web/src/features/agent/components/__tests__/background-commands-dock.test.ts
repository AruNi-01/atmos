import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dock = readFileSync(
  join(import.meta.dir, "../BackgroundCommandsDock.tsx"),
  "utf8",
);
const composer = readFileSync(
  join(import.meta.dir, "../AgentPromptComposer.tsx"),
  "utf8",
);

describe("background commands dock", () => {
  it("sits in the in-flow composer stack with plan and queue, not the floating overlay", () => {
    expect(composer).toContain("<BackgroundCommandsDock");
    const overlayAt = composer.indexOf("data-agent-chat-above-composer-overlays");
    const overlayClose = composer.indexOf("{aboveInputOverlay}");
    const dockAt = composer.indexOf("<BackgroundCommandsDock");
    const queueAt = composer.indexOf("<MessageQueueDock");
    const promptAt = composer.indexOf("<PromptInputProvider>");
    expect(overlayAt).toBeGreaterThan(-1);
    expect(dockAt).toBeGreaterThan(overlayClose);
    expect(queueAt).toBeGreaterThan(dockAt);
    expect(promptAt).toBeGreaterThan(queueAt);
    expect(composer).toContain("backgroundTools.length > 0");
    expect(composer).toContain("hasUpperComposerCards");
  });

  it("uses the same collapsible header chrome as plan and queue", () => {
    expect(dock).toContain("Collapsible");
    expect(dock).toContain("CollapsibleTrigger");
    expect(dock).toContain("CollapsibleContent");
    expect(dock).toContain("ComposerCollapseGlyph");
    expect(dock).toContain("SquareTerminal");
    expect(dock).toContain("collapsed={!isOpen}");
    expect(dock).not.toContain('className="bg-background"');
    expect(dock).toContain("hover:bg-muted/10");
    expect(dock).toContain(
      "motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none",
    );
    expect(dock).not.toContain("rounded-3xl");
  });
});
