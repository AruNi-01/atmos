import { describe, expect, it } from "bun:test";
import {
  BROWSER_USE_SLASH_COMMAND_ID,
  BROWSER_USE_SKILL_NAME,
  buildBrowserUseSlashCommand,
  matchesBrowserUseSlashQuery,
  resolveBrowserUseSkillRef,
} from "@/features/welcome/lib/slash-browser-use";

describe("slash-browser-use", () => {
  it("matches common queries", () => {
    expect(matchesBrowserUseSlashQuery("")).toBe(true);
    expect(matchesBrowserUseSlashQuery("browser")).toBe(true);
    expect(matchesBrowserUseSlashQuery("cdp")).toBe(true);
    expect(matchesBrowserUseSlashQuery("desktop-only-xyz")).toBe(false);
  });

  it("builds command id", () => {
    const cmd = buildBrowserUseSlashCommand({
      label: "Browser Use",
      description: "Page DOM control",
    });
    expect(cmd.id).toBe(BROWSER_USE_SLASH_COMMAND_ID);
    expect(cmd.label).toBe("Browser Use");
  });

  it("resolves skill path from list or fallback", () => {
    const found = resolveBrowserUseSkillRef([
      {
        id: BROWSER_USE_SKILL_NAME,
        name: BROWSER_USE_SKILL_NAME,
        path: "/tmp/atmos-browser-use",
        scope: "global",
        status: "enabled",
      } as never,
    ]);
    expect(found.absolutePath).toBe("/tmp/atmos-browser-use");
    expect(found.status).toBe("enabled");

    const disabled = resolveBrowserUseSkillRef([
      {
        id: BROWSER_USE_SKILL_NAME,
        name: BROWSER_USE_SKILL_NAME,
        path: "/tmp/atmos-browser-use",
        scope: "global",
        status: "disabled",
      } as never,
    ]);
    expect(disabled.status).toBe("disabled");

    const fallback = resolveBrowserUseSkillRef([]);
    expect(fallback.name).toBe(BROWSER_USE_SKILL_NAME);
    expect(fallback.absolutePath).toContain("atmos-browser-use");
    expect(fallback.status).toBe("enabled");
  });
});
