import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ptDesignSceneStorageKey } from "@/features/pt-design/storage-key";

describe("PT Design Atmos host wiring", () => {
  test("S23 center tool tab registry accepts pt-design", () => {
    const tabs = readFileSync(join(import.meta.dir, "../center-tool-tabs.ts"), "utf8");
    expect(tabs).toContain('export const PT_DESIGN_TAB_VALUE = "pt-design"');
    expect(tabs).toContain("PT_DESIGN_TAB_VALUE,");
    expect(tabs).toContain("CENTER_TOOL_TAB_VALUES");
    expect(ptDesignSceneStorageKey("x")).toBe("pt-design/v2/x");
  });

  test("launchpad includes pt-design", () => {
    const store = readFileSync(
      join(import.meta.dir, "../../features/settings/lib/launchpad-items.ts"),
      "utf8",
    );
    expect(store).toContain("'pt-design'");
  });

  test("warm-frame snapshot treats pt-design as a valid light tab", () => {
    const panels = readFileSync(
      join(import.meta.dir, "../CenterStagePanels.tsx"),
      "utf8",
    );
    expect(panels).toMatch(/validForContext[\s\S]*"pt-design"/);
    expect(panels).toContain('tabId === "pt-design"');
  });

  test("left sidebar launchpad opens the standalone /pt-design page", () => {
    const launchpad = readFileSync(
      join(import.meta.dir, "../LeftSidebarLaunchpad.tsx"),
      "utf8",
    );
    expect(launchpad).toContain("pt-design");
    expect(launchpad).toContain("PencilRuler");
    expect(launchpad).toContain('path: "/pt-design"');
    expect(launchpad).not.toContain("onOpenPtDesign");
    expect(launchpad).not.toContain('kind: "pt-design"');
    const sidebar = readFileSync(
      join(import.meta.dir, "../LeftSidebar.tsx"),
      "utf8",
    );
    expect(sidebar).not.toContain("onOpenPtDesign");
    expect(sidebar).not.toContain('url.searchParams.set("tab", "pt-design")');
    expect(sidebar).not.toContain("useOpenToolCenterTab");
    expect(sidebar).not.toMatch(/useQueryState\(\s*["']tab["']/);
    expect(sidebar).toContain("currentView === 'pt-design'");
    expect(launchpad).not.toMatch(/bare ["']Canvas["']\s*\n.*pt-design/i);
    const page = readFileSync(
      join(import.meta.dir, "../../app/(app)/pt-design/page.tsx"),
      "utf8",
    );
    expect(page).toContain("Prototype Design");
  });

  test("center frame mounts the public embed panel", () => {
    const frame = readFileSync(
      join(import.meta.dir, "../workspace-center-frame.tsx"),
      "utf8",
    );
    expect(frame).toContain("PtDesignCenterPanel");
    expect(frame).toContain("pt-design");
  });

  test("user-facing copy is Prototype Design", () => {
    const en = readFileSync(join(import.meta.dir, "../../../messages/en.json"), "utf8");
    const zh = readFileSync(join(import.meta.dir, "../../../messages/zh.json"), "utf8");
    expect(en).toContain("\"ptDesign\": \"Prototype Design\"");
    expect(zh).toContain("\"ptDesign\": \"原型设计\"");
    expect(zh).not.toContain("\"ptDesign\": \"Prototype Design\"");
    expect(en).not.toMatch(/"ptDesign": "PT Design"/);
    expect(zh).not.toMatch(/"ptDesign": "PT Design"/);
  });

  test("host panel forwards Atmos theme and a global scene key", () => {
    const panel = readFileSync(
      join(import.meta.dir, "../../features/pt-design/PtDesignCenterPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("useTheme");
    expect(panel).toContain("theme={theme}");
    expect(panel).toContain("bg-background");
    expect(panel).toContain("text-foreground");
    expect(panel).not.toContain("liveUrl");
    expect(panel).toContain("ptDesignSceneStorageKey");
    expect(panel).not.toContain('const PT_DESIGN_STORAGE_KEY = "pt-design:scene:global"');
    const key = readFileSync(
      join(import.meta.dir, "../../features/pt-design/storage-key.ts"),
      "utf8",
    );
    expect(key).toContain("`pt-design/v2/${contextId}`");
    expect(panel).toContain("useTranslations");
    expect(panel).toContain("shareCopy");
    expect(panel).toContain("collabServerUrl");
    expect(panel).toContain("getRuntimeApiConfig");
    expect(panel).toContain("httpDesignLibrary");
    expect(panel).toContain("library={library}");
    expect(panel).toContain("agentBridge");
    expect(panel).toContain("clientId={contextId}");
    expect(panel).toContain("AgentSurfaceIsland");
    expect(panel).toContain("relative h-full");
  });

  test("no-context center stage opens Prototype Design from /pt-design or a legacy tab", () => {
    const support = readFileSync(
      join(import.meta.dir, "../center-stage-support.tsx"),
      "utf8",
    );
    const stage = readFileSync(
      join(import.meta.dir, "../CenterStage.tsx"),
      "utf8",
    );
    expect(support).toContain("PtDesignStandaloneStage");
    expect(support).toContain('currentView === "pt-design" || ptDesignOpen');
    expect(stage).toContain('ptDesignOpen={storedLastTab === "pt-design" || tabFromUrl === "pt-design"}');
  });

  test("S23 / S28 standalone page uses the v2 scene key while workspace tabs stay per context", () => {
    expect(ptDesignSceneStorageKey("global")).toBe("pt-design/v2/global");
    expect(ptDesignSceneStorageKey("ws-1")).toBe("pt-design/v2/ws-1");
    const standalone = readFileSync(
      join(import.meta.dir, "../../features/pt-design/PtDesignStandaloneStage.tsx"),
      "utf8",
    );
    expect(standalone).toContain('PT_DESIGN_GLOBAL_CONTEXT_ID = "global"');
    expect(standalone).toContain("PtDesignCenterPanel");
    const frame = readFileSync(
      join(import.meta.dir, "../workspace-center-frame.tsx"),
      "utf8",
    );
    expect(frame).toContain("<KeptPtDesignCenterPanel contextId={contextId} />");
  });

  test("hosted collab invites skip onboarding and open a fullscreen guest board", () => {
    const gate = readFileSync(
      join(import.meta.dir, "../HostedAppShellGate.tsx"),
      "utf8",
    );
    const guest = readFileSync(
      join(import.meta.dir, "../../features/pt-design/PtDesignGuestStage.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      join(import.meta.dir, "../../features/pt-design/PtDesignCenterPanel.tsx"),
      "utf8",
    );
    expect(gate).toContain("hasPtDesignCollabInvite");
    expect(gate).toContain("PtDesignGuestStage");
    expect(gate).toContain("collabInviteOnLoad");
    expect(guest).toContain("data-testid=\"pt-design-guest\"");
    expect(guest).toContain("pt-design-guest-logo");
    expect(guest).toContain("https://atmos.land");
    expect(guest).toContain("memoryPersistence");
    expect(guest).toContain("LogoSvg");
    expect(guest).not.toContain("httpDesignLibrary");
    expect(guest).not.toContain("usePtDesignAgentBridge");
    expect(guest).not.toContain("CenterStageSurface");
    expect(guest).toContain("ptDesign.guest");
    expect(panel).not.toContain("pt-design-guest-logo");
    expect(panel).not.toContain("https://atmos.land");
    const en = readFileSync(join(import.meta.dir, "../../../messages/en.json"), "utf8");
    const zh = readFileSync(join(import.meta.dir, "../../../messages/zh.json"), "utf8");
    expect(en).toContain("\"logoLink\": \"Open Atmos\"");
    expect(zh).toContain("\"logoLink\": \"打开 Atmos 官网\"");
  });

  test("center stage panel does not trap position:fixed overlays", () => {
    const layout = readFileSync(join(import.meta.dir, "../PanelLayout.tsx"), "utf8");
    const center = layout.slice(layout.indexOf('id="root-center-stage"'));
    const className = center.match(/className="([^"]+)"/)?.[1] ?? "";
    expect(className).toBe("relative h-full");
    expect(className).not.toContain("contain:");
  });

  test("idle push-page shell does not keep a transform containing block", () => {
    const stack = readFileSync(
      join(import.meta.dir, "../../../../../packages/ui/src/components/motion/push-page-stack.tsx"),
      "utf8",
    );
    expect(stack).toContain("!shiftBase || reduce || !presented");
    expect(stack).toContain("presented && shiftBase && !reduce && \"will-change-transform\"");
  });

  test("S23 invoke still uses pt_design_bridge_* on the main /ws", () => {
    const api = readFileSync(join(import.meta.dir, "../../api/ws-api.ts"), "utf8");
    expect(api).toContain('wsRequest("pt_design_bridge_register"');
    expect(api).toContain('wsRequest("pt_design_bridge_unregister"');
    expect(api).toContain('wsRequest("pt_design_agent_dispatch_result"');
    const bridge = readFileSync(
      join(import.meta.dir, "../../features/pt-design/use-pt-design-agent-bridge.ts"),
      "utf8",
    );
    expect(bridge).toContain("pt_design_agent_dispatch");
  });

  test("S24 host mode labels are sentence case Edit / Interact", () => {
    const en = readFileSync(join(import.meta.dir, "../../../messages/en.json"), "utf8");
    expect(en).toContain('"edit": "Edit"');
    expect(en).toContain('"interact": "Interact"');
    expect(en).not.toContain('"edit": "EDIT"');
    expect(en).not.toContain('"interact": "INTERACT"');
  });
});
