import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dock = readFileSync(
  join(import.meta.dir, "../MessageQueueDock.tsx"),
  "utf8",
);

describe("message queue dock", () => {
  it("edits queued messages from the prompt input instead of a popover", () => {
    expect(dock).not.toContain("Popover");
    expect(dock).not.toContain("textarea");
    expect(dock).toContain("onToggleEdit");
    expect(dock).toContain("editingPromptId");
    expect(dock).toContain('aria-pressed={isEditing}');
  });

  it("keeps the queue item chrome normal while editing (highlight stays on main prompt)", () => {
    expect(dock).toContain('data-queue-item-editing={isEditing ? "true" : undefined}');
    expect(dock).not.toContain("border-dashed border-info");
    expect(dock).not.toContain('isEditing && "px-1.5"');
    expect(dock).not.toContain("rounded-lg border border-dashed border-info");
  });

  it("matches plan todo chrome without header or item dividers", () => {
    expect(dock).not.toContain('className="bg-background"');
    expect(dock).toContain("hover:bg-muted/10");
    expect(dock).not.toContain("bg-muted/20");
    expect(dock).not.toContain("border-b border-border/70");
    expect(dock).not.toContain("divide-y divide-border/60");
  });

  it("collapses the queue list from the header with height/opacity animation", () => {
    expect(dock).toContain("Collapsible");
    expect(dock).toContain("CollapsibleTrigger");
    expect(dock).toContain("CollapsibleContent");
    expect(dock).toContain("ListOrdered");
    expect(dock).toContain("ComposerCollapseGlyph");
    expect(dock).toContain("collapsed={!isOpen}");
    expect(dock).toContain(
      "motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none",
    );
  });

  it("exposes a fly-to target for composer send animation", () => {
    expect(dock).toContain('data-agent-message-queue=""');
  });

  it("keeps edit and delete actions visible on queue items", () => {
    expect(dock).toContain("Pencil");
    expect(dock).toContain("Trash2");
    expect(dock).not.toContain("setIsHovered");
    expect(dock).not.toContain("pointer-events-none opacity-0");
    expect(dock).not.toContain("showActions");
  });
});
