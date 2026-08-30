import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const card = readFileSync(
  join(import.meta.dir, "../AgentPermissionCard.tsx"),
  "utf8",
);

describe("agent permission card", () => {
  it("matches the composer radius and shows a shield title", () => {
    expect(card).toContain("rounded-3xl");
    expect(card).toContain("ShieldCheck");
    expect(card).toContain("AgentCommandLine");
    expect(card).toContain("permissionOptionVariant");
  });

  it("keeps once highlighted, always filled, and reject borderless", () => {
    expect(card).toContain('variant={permissionOptionVariant(opt.kind)}');
    expect(card).toContain('variant="default"');
    expect(card).toContain('variant="ghost"');
    expect(card).not.toContain('kind.startsWith("allow")');
  });

  it("scrolls long commands inside the command box, not the whole card", () => {
    expect(card).toContain("overflow-x-hidden");
    expect(card).toContain("min-w-0 max-w-full overflow-hidden rounded-2xl");
    const command = readFileSync(
      join(import.meta.dir, "../AgentCommandLine.tsx"),
      "utf8",
    );
    expect(command).toContain("overflow-x-auto overscroll-x-contain");
    expect(command).toContain("w-max min-w-full");
    expect(command).toContain("whitespace-pre");
    expect(command).not.toContain("whitespace-pre-wrap");
  });
});
