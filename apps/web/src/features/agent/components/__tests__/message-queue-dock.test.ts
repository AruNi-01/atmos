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

  it("draws a dashed info border around the queued text while editing", () => {
    expect(dock).toContain('data-queue-item-editing={isEditing ? "true" : undefined}');
    expect(dock).toContain("rounded-lg border border-dashed border-info");
    expect(dock).toContain("isEditing && \"px-1.5\"");
  });
});
