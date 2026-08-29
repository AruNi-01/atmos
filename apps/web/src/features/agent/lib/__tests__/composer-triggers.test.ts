import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { replaceTextareaTrigger } from "@/features/agent/lib/composer-triggers";

describe("agent composer triggers", () => {
  it("replaces an @ query with a file mention token", () => {
    expect(replaceTextareaTrigger("see @rea", 4, 3, "@file:README.md ")).toBe(
      "see @file:README.md ",
    );
  });

  it("replaces a / query with an ACP slash command", () => {
    expect(replaceTextareaTrigger("/pl", 0, 2, "/plan ")).toBe("/plan ");
  });

  it("clears the / query so a selected command can become a chip", () => {
    expect(replaceTextareaTrigger("/hooks-list", 0, 10, "")).toBe("");
    expect(replaceTextareaTrigger("see /comp", 4, 4, "")).toBe("see ");
  });

  it("inserts selected slash commands and mentions as PromptComposer chips", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../hooks/use-agent-composer-popovers.tsx"),
      "utf8",
    );
    expect(source).toContain("applyMentionAtRange");
    expect(source).toContain("applySlashAtRange");
    expect(source).toContain('kind: "command"');
    expect(source).toContain('kind: "file"');
    expect(source).toContain('kind: "skill"');
    expect(source).not.toContain("replaceTextareaTrigger");
    expect(source).not.toContain("onAtCancel: closePopovers");
    expect(source).not.toContain("onSlashCancel: closePopovers");
    expect(source).toContain("commandsTitle");
    expect(source).toContain("slashPopover.agentCommands");
  });
});
