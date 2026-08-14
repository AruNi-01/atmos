import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../../../..");

describe("APP-059 experience kernel", () => {
  it("skill is one loop starting at state", () => {
    const skill = readFileSync(
      join(root, "skills/atmos-browser-use/SKILL.md"),
      "utf8",
    );
    expect(skill).toContain("## One loop");
    expect(skill).toContain("atmos browser-use state");
    expect(skill).toContain("capability table");
    expect(skill).toContain("do **not** include `elements[]`");
    expect(skill).toContain("capability_flags");
    expect(skill).not.toContain("user_picks");
    expect(skill).not.toContain("prepare --backend embedded");
    expect(skill).toContain("Placement is the user's Settings");
    const cli = readFileSync(
      join(root, "apps/cli/src/commands/browser_use.rs"),
      "utf8",
    );
    expect(cli).not.toContain("surface");
  });

  it("agent tab bridge can ensure a host", () => {
    const bridge = readFileSync(
      join(root, "apps/web/src/features/browser/hooks/use-browser-agent-tab-bridge.ts"),
      "utf8",
    );
    expect(bridge).toContain('action === "ensure-bind"');
    expect(bridge).toContain("ensureSurface");
  });

  it("center tabs reuse the last Browser instead of always creating", () => {
    const store = readFileSync(
      join(root, "apps/web/src/features/browser/store/use-browser-center-tabs.ts"),
      "utf8",
    );
    expect(store).toContain("reuseOrOpenBrowser");
    expect(store).toContain("lastBrowser");
  });

  it("human open follows the default surface", () => {
    const hook = readFileSync(
      join(root, "apps/web/src/features/browser/hooks/use-open-browser-center-tab.ts"),
      "utf8",
    );
    const welcome = readFileSync(
      join(root, "apps/web/src/features/welcome/components/WelcomePage.tsx"),
      "utf8",
    );
    const layout = readFileSync(
      join(root, "apps/web/src/app-shell/PanelLayout.tsx"),
      "utf8",
    );
    expect(hook).toContain("ensureSurface");
    expect(welcome).toContain("ensureSurface");
    expect(layout).toContain("currentContextId");
  });
});
