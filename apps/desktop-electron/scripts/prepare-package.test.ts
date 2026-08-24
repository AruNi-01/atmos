import { describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STAGED_CLI_REQUIREMENT_REL,
  TRACKED_CLI_REQUIREMENT_REL,
  parseCliVersionFromCargoToml,
  resolveMinCliVersion,
  writeStagedCliRequirement,
} from "./prepare-package.ts";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(appRoot, "../..");

describe("prepare-package CLI floor overlay", () => {
  it("keeps tracked and staged pins on distinct paths", () => {
    expect(TRACKED_CLI_REQUIREMENT_REL).toBe(
      "resources/desktop-use/cli-requirement.json",
    );
    expect(STAGED_CLI_REQUIREMENT_REL).toBe(
      "resources/desktop-use-stage/cli-requirement.json",
    );
    expect(STAGED_CLI_REQUIREMENT_REL).not.toBe(TRACKED_CLI_REQUIREMENT_REL);
  });

  it("reads min CLI from apps/cli/Cargo.toml", () => {
    const cargo = readFileSync(join(repoRoot, "apps/cli/Cargo.toml"), "utf8");
    const version = parseCliVersionFromCargoToml(cargo);
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
    expect(
      resolveMinCliVersion({
        cliCargoText: cargo,
        fallbackJsonText: `{"min_cli_version":"0.0.0"}`,
      }),
    ).toBe(version);
  });

  it("falls back to crates pin when Cargo.toml has no version", () => {
    expect(
      resolveMinCliVersion({
        cliCargoText: "[package]\nname = \"atmos\"\n",
        fallbackJsonText: `{"min_cli_version":"2026.8.7"}`,
      }),
    ).toBe("2026.8.7");
  });

  it("writes the overlay without touching the tracked pin", () => {
    const root = mkdtempSync(join(tmpdir(), "atmos-cli-req-stage-"));
    const tracked = join(root, TRACKED_CLI_REQUIREMENT_REL);
    mkdirSync(dirname(tracked), { recursive: true });
    writeFileSync(
      tracked,
      `${JSON.stringify({ schema_version: 1, min_cli_version: "2026.8.7" }, null, 2)}\n`,
      "utf8",
    );
    const before = readFileSync(tracked, "utf8");

    const dest = writeStagedCliRequirement(root, "2026.8.23");
    expect(dest).toBe(join(root, STAGED_CLI_REQUIREMENT_REL));
    expect(existsSync(dest)).toBe(true);
    expect(JSON.parse(readFileSync(dest, "utf8"))).toEqual({
      schema_version: 1,
      min_cli_version: "2026.8.23",
    });
    expect(readFileSync(tracked, "utf8")).toBe(before);
  });

  it("does not write the tracked resources pin from prepare-package", () => {
    const src = readFileSync(join(appRoot, "scripts/prepare-package.ts"), "utf8");
    expect(src).toContain("writeStagedCliRequirement");
    expect(src).not.toContain('join(manifestDestDir, "cli-requirement.json")');
  });

  it("ships the gitignored stage pin, not the tracked resources pin", () => {
    const yml = readFileSync(join(appRoot, "electron-builder.yml"), "utf8");
    expect(yml).toContain("from: resources/desktop-use\n");
    expect(yml).toContain("!cli-requirement.json");
    expect(yml).toContain(
      "from: resources/desktop-use-stage/cli-requirement.json",
    );
    expect(yml).toContain("to: desktop-use/cli-requirement.json");

    const gitignore = readFileSync(join(appRoot, ".gitignore"), "utf8");
    expect(gitignore).toContain("resources/desktop-use-stage/");

    const packageSrc = readFileSync(join(appRoot, "scripts/package.ts"), "utf8");
    expect(packageSrc).toContain("STAGED_CLI_REQUIREMENT_REL");

    const tracked = JSON.parse(
      readFileSync(join(appRoot, TRACKED_CLI_REQUIREMENT_REL), "utf8"),
    ) as { min_cli_version: string };
    const cratesPin = JSON.parse(
      readFileSync(
        join(repoRoot, "crates/desktop-use/manifest/cli-requirement.json"),
        "utf8",
      ),
    ) as { min_cli_version: string };
    expect(tracked.min_cli_version).toBe(cratesPin.min_cli_version);
  });
});
