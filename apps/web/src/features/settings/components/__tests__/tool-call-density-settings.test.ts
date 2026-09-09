import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../../../..");

describe("tool call density settings", () => {
  it("reuses the effort range slider in the agents settings page", () => {
    const section = readFileSync(
      join(root, "apps/web/src/features/settings/components/AgentToolCallDensitySettingsSection.tsx"),
      "utf8",
    );
    const agents = readFileSync(
      join(root, "apps/web/src/features/settings/components/CodeAgentSettingsSection.tsx"),
      "utf8",
    );
    expect(section).toContain("RangeSlider");
    expect(section).toContain('variant="effort"');
    expect(section).toContain("compact");
    expect(section).toContain("detailed");
    expect(section).toContain("createPortal");
    expect(section).toContain("SPRING_LAYOUT");
    expect(section).toContain("left: anchor.x");
    expect(section).toContain("AgentToolCallDensityPreview");
    expect(section).toContain("toolCallDensityIndexFromRatio");
    expect(agents).toContain("AgentToolCallDensitySettingsSection");
  });

  it("renders compact, standard, and detailed transcript sketches", () => {
    const preview = readFileSync(
      join(root, "apps/web/src/features/settings/components/AgentToolCallDensityPreview.tsx"),
      "utf8",
    );
    expect(preview).toContain('density === "compact"');
    expect(preview).toContain('density === "detailed"');
    expect(preview).not.toContain("createdIn");
    expect(preview).toContain("thoughtFor");
    expect(preview).toContain("sampleAnswer");
    expect(preview).toContain("sampleMidText");
    expect(preview).toContain("lookTools");
    expect(preview).toContain("writeTools");
    expect(preview).not.toContain("allTools");
    expect(preview).not.toContain("quietTools");
    expect(preview).toContain("ResultSketch");
    expect(preview).toContain('kind="read"');
    expect(preview).toContain('kind="search"');
    expect(preview).toContain('expanded ? "diff"');
    expect(preview).toContain("flex w-full min-w-0");
    expect(preview).not.toContain("inline-flex");
  });
});
