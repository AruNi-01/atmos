import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const FEATURES = join(ROOT, "../../features");

const SURFACES = [
  "skills/components/SkillsInstalledTab.tsx",
  "skills/components/SkillsMarketTab.tsx",
  "skills/components/SkillsResourcesTab.tsx",
  "agent-sessions/components/HostSessionListView.tsx",
  "agent/components/AgentChatSessionsView.tsx",
  "agent/components/agent-manager-cards.tsx",
  "automations/components/AutomationListPanel.tsx",
  "workspace/components/ArchivedWorkspacesView.tsx",
  "pt-design/PtDesignOverview.tsx",
  "task/components/TaskLinearPanel.tsx",
  "simulator/components/SimulatorSetupCard.tsx",
];

describe("PageEmptyState", () => {
  it("wraps Spectrum EmptyState with Observer Minimal defaults", () => {
    const source = readFileSync(join(ROOT, "PageEmptyState.tsx"), "utf8");
    expect(source).toContain('backdrop = "stack"');
    expect(source).toContain("max-w-[440px]");
    expect(source).toContain("EmptyState");
  });

  it("is used by the agreed launchpad empties", () => {
    for (const file of SURFACES) {
      const source = readFileSync(join(FEATURES, file), "utf8");
      expect(source, file).toContain("PageEmptyState");
    }
  });
});
