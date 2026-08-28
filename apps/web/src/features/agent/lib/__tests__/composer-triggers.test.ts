import { describe, expect, it } from "bun:test";
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
});
