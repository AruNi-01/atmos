import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workspaceContent = readFileSync(
  join(import.meta.dir, "../sidebar/WorkspaceContent.tsx"),
  "utf8",
);
const surfaceSwitch = readFileSync(
  join(import.meta.dir, "../workspace-surface-switch.ts"),
  "utf8",
);

describe("left sidebar workspace list hover", () => {
  it("keeps one info popover session so moving down the list swaps content", () => {
    expect(workspaceContent).toContain("workspaceInfoHoverSession.enter");
    expect(workspaceContent).toContain("workspaceInfoHoverSession.leave");
    expect(workspaceContent).not.toContain("setIsInfoPopoverOpen");
  });

  it("uses instant full-accent hover like settings, not a delayed color fade", () => {
    const rowClass = workspaceContent.slice(
      workspaceContent.indexOf("data-ws-row="),
      workspaceContent.indexOf("isPlaceholder && \"opacity-20\""),
    );
    expect(rowClass).toContain("hover:bg-sidebar-accent");
    expect(rowClass).toContain("bg-sidebar-accent");
    expect(rowClass).not.toContain("hover:bg-sidebar-accent/50");
    expect(rowClass).not.toContain("bg-sidebar-accent/50");
    expect(rowClass).not.toContain("transition-colors");
  });

  it("optimistic DOM selection matches the React row fill", () => {
    expect(surfaceSwitch).toContain('row.classList.toggle("bg-sidebar-accent", isActive)');
    expect(surfaceSwitch).toContain('row.classList.toggle("text-sidebar-accent-foreground", isActive)');
    expect(surfaceSwitch).not.toContain('bg-sidebar-accent/50');
  });
});
