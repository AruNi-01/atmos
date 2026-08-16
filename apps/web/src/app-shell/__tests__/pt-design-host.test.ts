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

  test("left sidebar launchpad opens the center tab", () => {
    const launchpad = readFileSync(
      join(import.meta.dir, "../LeftSidebarLaunchpad.tsx"),
      "utf8",
    );
    expect(launchpad).toContain("pt-design");
    expect(launchpad).toContain("onOpenPtDesign");
    const sidebar = readFileSync(
      join(import.meta.dir, "../LeftSidebar.tsx"),
      "utf8",
    );
    expect(sidebar).toContain("onOpenPtDesign");
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
});
