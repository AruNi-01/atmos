import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isCenterToolTabValue,
  PT_DESIGN_TAB_VALUE,
} from "@/app-shell/center-tool-tabs";

describe("PT Design Atmos host wiring", () => {
  test("center tool tab registry accepts pt-design", () => {
    expect(PT_DESIGN_TAB_VALUE).toBe("pt-design");
    expect(isCenterToolTabValue("pt-design")).toBe(true);
  });

  test("launchpad includes pt-design", () => {
    const store = readFileSync(
      join(import.meta.dir, "../../features/settings/store/experiment-settings-store.ts"),
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

  test("left sidebar launchpad opens the center tab without a workspace", () => {
    const launchpad = readFileSync(
      join(import.meta.dir, "../LeftSidebarLaunchpad.tsx"),
      "utf8",
    );
    expect(launchpad).toContain("pt-design");
    expect(launchpad).toContain("PencilRuler");
    expect(launchpad).toContain("onOpenPtDesign");
    expect(launchpad).not.toMatch(/<div onClick=\{onOpenPtDesign\}/);
    expect(launchpad).toMatch(/onClick=\{onOpenPtDesign\}[\s\S]{0,80}type="button"|type="button"[\s\S]{0,80}onClick=\{onOpenPtDesign\}/);
    const sidebar = readFileSync(
      join(import.meta.dir, "../LeftSidebar.tsx"),
      "utf8",
    );
    expect(sidebar).toContain("onOpenPtDesign");
    expect(sidebar).not.toContain("if (!effectiveContextId) return;");
    expect(sidebar).toContain('url.searchParams.set("tab", "pt-design")');
    expect(sidebar).not.toContain("useOpenToolCenterTab");
    expect(sidebar).not.toMatch(/useQueryState\(\s*["']tab["']/);
    expect(launchpad).not.toMatch(/bare ["']Canvas["']\s*\n.*pt-design/i);
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
    expect(panel).toContain("pt-design:scene:global");
    expect(panel).not.toContain("`pt-design:scene:${contextId}`");
    expect(panel).toContain("useTranslations");
    expect(panel).toContain("shareCopy");
    expect(panel).toContain("collabServerUrl");
    expect(panel).toContain("getRuntimeApiConfig");
    expect(panel).toContain("httpDesignLibrary");
    expect(panel).toContain("library={library}");
    expect(panel).toContain("agentBridge");
  });

  test("no-context center stage opens Prototype Design from the URL tab", () => {
    const support = readFileSync(
      join(import.meta.dir, "../center-stage-support.tsx"),
      "utf8",
    );
    const stage = readFileSync(
      join(import.meta.dir, "../CenterStage.tsx"),
      "utf8",
    );
    expect(support).toContain("PtDesignStandaloneStage");
    expect(support).toContain("ptDesignOpen");
    expect(stage).toContain('ptDesignOpen={tabFromUrl === "pt-design"}');
  });
});
