import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const picker = readFileSync(
  join(import.meta.dir, "../AgentChatWorkingDirectoryPicker.tsx"),
  "utf8",
);

describe("agent chat working directory picker", () => {
  it("reuses the agent/model hover flyout with search on the first menu", () => {
    expect(picker).toContain("MorphPopover");
    expect(picker).toContain("agentConfigFlyoutSide");
    expect(picker).toContain("agentConfigFlyoutOffsetTop");
    expect(picker).toContain("filterWorkingDirectoryMenu");
    expect(picker).toContain('placeholder={t("searchPlaceholder")}');
    expect(picker).toContain("THREAD_WORKING_DIRECTORY");
    expect(picker).toContain('t("projects")');
    expect(picker).toContain("openFlyout(project.id)");
    expect(picker).toContain("filterProjectWorkspaceFlyout");
    expect(picker).toContain("flyoutItems.workspaces.map");
    expect(picker).toContain('placeholder={t("searchWorkspaces")}');
    expect(picker).toContain("workspace.localPath");
    expect(picker).toContain("project.mainFilePath");
    expect(picker).toContain("autoFocus");
    expect(picker).toContain("max-h-[min(16rem,calc(100dvh-8rem))]");
  });
});
