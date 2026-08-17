import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isCenterToolTabValue,
  PT_DESIGN_TAB_VALUE,
} from "@/app-shell/center-tool-tabs";
import { ptDesignSceneStorageKey } from "@/features/pt-design/storage-key";

describe("PT Design Atmos host wiring", () => {
  test("center tool tab registry accepts pt-design", () => {
    expect(PT_DESIGN_TAB_VALUE).toBe("pt-design");
    expect(isCenterToolTabValue("pt-design")).toBe(true);
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
    expect(panels).toContain('frameActiveTab === "pt-design"');
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
    expect(zh).toContain("\"ptDesign\": \"Prototype Design\"");
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
    expect(key).toContain("`pt-design:scene:${contextId}`");
    expect(panel).toContain("useTranslations");
    expect(panel).toContain("shareCopy");
    expect(panel).toContain("collabServerUrl");
    expect(panel).toContain("getRuntimeApiConfig");
    expect(panel).toContain("httpDesignLibrary");
    expect(panel).toContain("library={library}");
    expect(panel).toContain("agentBridge");
    expect(panel).toContain("clientId={contextId}");
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
    expect(stage).toContain('ptDesignOpen={tabFromUrl === "pt-design"}');
  });

  test("standalone page uses the global scene key while workspace tabs stay per context", () => {
    expect(ptDesignSceneStorageKey("global")).toBe("pt-design:scene:global");
    expect(ptDesignSceneStorageKey("ws-1")).toBe("pt-design:scene:ws-1");
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
    expect(frame).toContain("<PtDesignCenterPanel contextId={contextId} />");
  });

  test("center stage panel does not trap position:fixed overlays", () => {
    const layout = readFileSync(join(import.meta.dir, "../PanelLayout.tsx"), "utf8");
    const center = layout.slice(layout.indexOf('id="root-center-stage"'));
    const className = center.match(/className="([^"]+)"/)?.[1] ?? "";
    expect(className).toBe("relative h-full");
    expect(className).not.toContain("contain:");
  });
});
