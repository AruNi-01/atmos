import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const repoRoot = join(import.meta.dir, "../../../../../../../");

describe("atmos-automation skill registry", () => {
  test("is registered in both sync lists and cross-linked from atmos-cli", () => {
    const skill = readFileSync(join(repoRoot, "skills/atmos-automation/SKILL.md"), "utf8");
    const manifest = readFileSync(
      join(repoRoot, "skills/system-skills-manifest.json"),
      "utf8",
    );
    const sync = readFileSync(
      join(repoRoot, "crates/infra/src/utils/system_skill_sync.rs"),
      "utf8",
    );
    const cliSkill = readFileSync(join(repoRoot, "skills/atmos-cli/SKILL.md"), "utf8");
    expect(skill).toContain("atmos automation complete");
    expect(manifest).toContain("atmos-automation");
    expect(sync).toContain('"atmos-automation"');
    expect(sync).toContain("skills/atmos-automation");
    expect(cliSkill.toLowerCase()).toContain("atmos-automation");
  });
});
