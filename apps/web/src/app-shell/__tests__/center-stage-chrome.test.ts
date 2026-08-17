import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CENTER_STAGE_CARD_CLASS,
  CENTER_STAGE_RADIUS_CLASS,
  CENTER_STAGE_RADIUS_CSS,
} from "@/app-shell/sidebar-layout-constants";

function read(rel: string) {
  return readFileSync(join(import.meta.dir, rel), "utf8");
}

describe("center-stage chrome", () => {
  test("shared card uses the center-stage radius token", () => {
    expect(CENTER_STAGE_RADIUS_CLASS).toBe("rounded-xl");
    expect(CENTER_STAGE_RADIUS_CSS).toBe("var(--radius-xl)");
    expect(CENTER_STAGE_CARD_CLASS).toContain(CENTER_STAGE_RADIUS_CLASS);
    expect(CENTER_STAGE_CARD_CLASS).toContain("overflow-hidden");
    expect(CENTER_STAGE_CARD_CLASS).toContain("ring-1");
  });

  test("every no-context center view goes through CenterStageSurface", () => {
    const support = read("../center-stage-support.tsx");
    expect(support).toContain("CenterStageSurface");
    expect(support).toContain("<WorkspacesManagementView />");
    expect(support).toContain("<SkillsView />");
    expect(support).toContain("<TerminalsView />");
    expect(support).toContain("<AgentManagerView />");
    expect(support).toContain("<AutomationPage />");
    expect(support).toContain("<DiskAnalyzerPage />");
    expect(support).toContain("<TokenUsagePage />");
    expect(support).toContain("<TaskManagementView />");
    expect(support).toContain("<HostedWelcomeGate");
    expect(support).toContain("<PtDesignStandaloneStage />");
    expect(support).not.toContain('className="h-full overflow-hidden"');
  });

  test("workspace and setup surfaces reuse the shared card class", () => {
    const stage = read("../CenterStage.tsx");
    expect(stage).toContain("CenterStageSurface");
    expect(stage).toContain("CENTER_STAGE_CARD_CLASS");
    expect(stage).toContain("CENTER_STAGE_SHELL_CLASS");
  });

  test("standalone Prototype Design does not apply a second card chrome", () => {
    const standalone = read("../../features/pt-design/PtDesignStandaloneStage.tsx");
    expect(standalone).toContain("PtDesignCenterPanel");
    expect(standalone).not.toContain("CENTER_STAGE_GUTTER_CLASS");
    expect(standalone).not.toContain("rounded-xl");
  });
});
