import { describe, expect, it } from "bun:test";
import {
  buildDesktopUseSlashCommand,
  DESKTOP_USE_SLASH_COMMAND_ID,
  matchesDesktopUseSlashQuery,
  resolveDesktopUseSkillRef,
} from "@/features/welcome/lib/slash-desktop-use";
import type { SkillInfo } from "@/api/ws-api";

describe("slash-desktop-use", () => {
  it("matches desktop use queries", () => {
    expect(matchesDesktopUseSlashQuery("")).toBe(true);
    expect(matchesDesktopUseSlashQuery("desk")).toBe(true);
    expect(matchesDesktopUseSlashQuery("screenshot")).toBe(true);
    expect(matchesDesktopUseSlashQuery("xyz")).toBe(false);
  });

  it("builds command option", () => {
    const cmd = buildDesktopUseSlashCommand({
      label: "Desktop Use",
      description: "desc",
    });
    expect(cmd.id).toBe(DESKTOP_USE_SLASH_COMMAND_ID);
    expect(cmd.label).toBe("Desktop Use");
  });

  it("resolves skill path from catalog or fallback", () => {
    const skill = {
      id: "x",
      name: "atmos-desktop-use",
      path: "/Users/me/.atmos/skills/.system/atmos-desktop-use",
    } as SkillInfo;
    expect(resolveDesktopUseSkillRef([skill]).absolutePath).toContain(
      "atmos-desktop-use",
    );
    expect(resolveDesktopUseSkillRef([]).absolutePath).toContain(
      ".system/atmos-desktop-use",
    );
  });
});
