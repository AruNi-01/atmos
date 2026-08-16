import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../../../../..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("drawer close chrome", () => {
  it("centers the shared overlay close in the compact header row", () => {
    const src = read("packages/ui/src/components/ui/drawer.tsx");
    expect(src).toContain("function DrawerCloseButton");
    expect(src).toContain("absolute right-2 top-1.5");
    expect(src).toContain('const drawerCloseReserveClass = "pr-11"');
    expect(src).not.toMatch(/drawerCloseButtonClassName[\s\S]*top-3/);
  });

  it("uses the shared close button in every product drawer", () => {
    const hosts = [
      "apps/web/src/features/task/components/task-github-drawer/TaskGithubDrawerHost.tsx",
      "apps/web/src/features/task/components/TaskLinearDrawer.tsx",
      "apps/web/src/features/automations/components/AutomationRunDrawer.tsx",
    ];
    for (const rel of hosts) {
      const src = read(rel);
      expect(src).toContain("DrawerCloseButton");
      expect(src).toContain("DrawerCloseReserveProvider");
      expect(src).not.toContain("absolute right-3 top-3");
    }
  });

  it("keeps drawer headers from sliding under the overlay close", () => {
    const commit = read(
      "apps/web/src/features/github/components/CommitDetailView.tsx",
    );
    expect(commit).toContain("useDrawerCloseReserve");
    expect(commit).toContain("drawerCloseReserveClass");
    expect(commit).toContain("min-w-0 flex-1 truncate");

    const pr = read("apps/web/src/features/github/components/PRDetailView.tsx");
    expect(pr).toContain("headerTrailing || reserveClose ? \"right-10\" : \"right-0\"");

    const issue = read(
      "apps/web/src/features/github/components/IssueDetailView.tsx",
    );
    expect(issue).toContain("headerTrailing || reserveClose ? \"right-10\" : \"right-0\"");

    const actions = read(
      "apps/web/src/features/github/components/ActionsDetailView.tsx",
    );
    expect(actions).toContain("reserveClose && drawerCloseReserveClass");

    const linear = read(
      "apps/web/src/features/task/components/TaskLinearDrawer.tsx",
    );
    expect(linear).toContain("drawerCloseReserveClass");
  });
});
