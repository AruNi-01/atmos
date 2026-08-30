import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const label = readFileSync(
  join(import.meta.dir, "../AgentWorkedForLabel.tsx"),
  "utf8",
);

describe("agent worked-for label", () => {
  it("keeps duration static unless timestamp reveal is requested", () => {
    expect(label).toContain('reveal = "duration"');
    expect(label).toContain('reveal?: "duration" | "timestamp"');
    expect(label).toContain('const swapOnHover = reveal === "timestamp" && Boolean(clock)');
    expect(label).toContain("formatWorkedAt");
    expect(label).toContain("formatWorkDuration");
  });
});
