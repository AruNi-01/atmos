import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = join(import.meta.dir, "../../..");
const workflowPath = join(root, ".github/workflows/ci-mobile-ios-parity.yml");
const workflow = readFileSync(workflowPath, "utf8");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: { lint: string };
};

function sectionBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function restoreKeyLines(block: string): string[] {
  const marker = "restore-keys: |";
  const start = block.indexOf(marker);
  if (start === -1) {
    return [];
  }
  const lines: string[] = [];
  for (const line of block.slice(start + marker.length).split("\n")) {
    if (line.trim() === "") {
      if (lines.length > 0) break;
      continue;
    }
    if (!line.startsWith("            ")) break;
    lines.push(line.trim());
  }
  return lines;
}

const onBlock = sectionBetween(workflow, "\non:\n", "\nconcurrency:\n");
const structural = sectionBetween(workflow, "  structural:\n", "  ios-simulator:\n");
const iosSimulator = workflow.slice(workflow.indexOf("  ios-simulator:\n"));
const iosRestore = sectionBetween(
  iosSimulator,
  "      - name: Restore generated iOS tree\n",
  "      - name: Restore CocoaPods download cache\n",
);
const iosSave = sectionBetween(
  iosSimulator,
  "      - name: Save generated iOS tree\n",
  "      - name: Verify generated iOS tree\n",
);
const podhomeRestore = sectionBetween(
  iosSimulator,
  "      - name: Restore CocoaPods download cache\n",
  "      - name: Prebuild iOS\n",
);
const prebuild = sectionBetween(
  iosSimulator,
  "      - name: Prebuild iOS\n",
  "      - name: Install CocoaPods\n",
);
const podInstall = sectionBetween(
  iosSimulator,
  "      - name: Install CocoaPods\n",
  "      - name: Save CocoaPods download cache\n",
);
const buildStep = sectionBetween(
  iosSimulator,
  "      - name: Build Release simulator app\n",
  "      - name: Install, launch, and capture\n",
);
const summaryStep = sectionBetween(
  iosSimulator,
  "      - name: Write summary\n",
  "      - name: Upload ios-parity\n",
);

const iosGenKey =
  "ios-gen-${{ runner.os }}-${{ steps.xcode.outputs.version }}-${{ steps.xcode.outputs.scope }}-${{ hashFiles('bun.lock', 'apps/mobile/package.json', 'apps/mobile/app.config.js', 'apps/mobile/app.json', 'apps/mobile/plugins/**', 'apps/mobile/modules/**', 'scripts/agent-chat-parity/exclude-dev-client.js') }}";

describe("QUALITY-022 ios-simulator caches", () => {
  test("exact ios-gen hit skips prebuild and pod install", () => {
    expect(iosRestore).toContain("actions/cache/restore@v4");
    expect(iosRestore).toContain("path: apps/mobile/ios");
    expect(iosRestore).toContain(`key: ${iosGenKey}`);
    expect(iosRestore).not.toContain("restore-keys:");
    expect(iosSave).toContain("actions/cache/save@v4");
    expect(iosSave).toContain("path: apps/mobile/ios");
    expect(iosSave).toContain(`key: ${iosGenKey}`);
    expect(prebuild).toContain("steps.ios-restore.outputs.cache-hit != 'true'");
    expect(podInstall).toContain("steps.ios-restore.outputs.cache-hit != 'true'");
    expect(podhomeRestore).toContain("steps.ios-restore.outputs.cache-hit != 'true'");
    expect(iosSimulator).toContain("      - name: Verify generated iOS tree\n");
    expect(iosSimulator).toContain("id: ios-restore");
  });

  test("CocoaPods home cache is only for the miss path", () => {
    expect(podhomeRestore).toContain("~/Library/Caches/CocoaPods");
    expect(podhomeRestore).toContain("actions/cache/restore@v4");
    expect(restoreKeyLines(podhomeRestore)).toEqual([
      "ios-podhome-${{ runner.os }}-${{ steps.xcode.outputs.version }}-",
      "ios-podhome-${{ runner.os }}-",
    ]);
    expect(iosSimulator).not.toContain("ios-pods-");
  });

  test("DerivedData is not cached", () => {
    expect(iosSimulator).not.toContain("ios-dd-");
    expect(iosSimulator).not.toContain("deriveddata-restore");
    expect(iosSimulator).not.toContain("Restore DerivedData cache");
    expect(iosSimulator).not.toContain("Save DerivedData cache");
    expect(iosSimulator).not.toContain("Normalize native input mtimes");
    expect(iosSimulator).not.toContain("Prune DerivedData before cache save");
    expect(summaryStep).not.toContain("deriveddata cache-hit");
    expect(summaryStep).toContain("ios-gen cache-hit");
    expect(summaryStep).toContain("CompileC count");
  });

  test("xcodebuild still writes a local derived path and counts CompileC", () => {
    expect(iosSimulator).toContain("DERIVED_DATA: ${{ github.workspace }}/artifacts/derived");
    expect(buildStep).toContain("-derivedDataPath");
    expect(buildStep).toContain('derived="${DERIVED_DATA:-$GITHUB_WORKSPACE/artifacts/derived}"');
    expect(buildStep).toContain("COMPILER_INDEX_STORE_ENABLE=NO");
    expect(buildStep).toContain('echo "compilec=${compilec}" >> "$GITHUB_OUTPUT"');
    expect(iosSimulator).not.toContain('rm -rf "$derived"');
    expect(iosSimulator).not.toContain('rm -rf "$DERIVED_DATA"');
  });

  test("cache keys include os, Xcode version, scope, and input hashes", () => {
    expect(iosSimulator).toContain("id: xcode");
    expect(iosSimulator).toContain('echo "version=${xcode_version}" >> "$GITHUB_OUTPUT"');
    expect(iosSimulator).toContain("xcodebuild -version");
    expect(iosSimulator).toContain('[[ "${PR_NUMBER}" =~ ^[0-9]+$ ]]');
    expect(iosSimulator).toContain('echo "scope=pr-${PR_NUMBER}" >> "$GITHUB_OUTPUT"');
    expect(iosSimulator).toContain('echo "scope=ref-${sanitized}" >> "$GITHUB_OUTPUT"');
  });

  test("ios-gen save is not restricted to main", () => {
    const xcodebuildAt = iosSimulator.indexOf("      - name: Build Release simulator app\n");
    const captureAt = iosSimulator.indexOf("      - name: Install, launch, and capture\n");
    const iosSaveAt = iosSimulator.indexOf("      - name: Save generated iOS tree\n");
    expect(xcodebuildAt).toBeGreaterThan(-1);
    expect(iosSaveAt).toBeGreaterThan(-1);
    expect(iosSaveAt).toBeLessThan(xcodebuildAt);
    expect(captureAt).toBeGreaterThan(xcodebuildAt);
    expect(iosSave).not.toContain("refs/heads/main");
  });

  test("ios-simulator stays opt-in; this workflow has no push trigger", () => {
    expect(onBlock).toContain("workflow_dispatch:");
    expect(onBlock).toContain("pull_request:");
    expect(onBlock).toContain("labeled");
    expect(onBlock).toContain("unlabeled");
    expect(onBlock).not.toMatch(/^\s*push:/m);
    expect(iosSimulator).toContain("github.event_name == 'workflow_dispatch'");
    expect(iosSimulator).toContain(
      "contains(github.event.pull_request.labels.*.name, 'ios-parity')",
    );
    expect(structural).not.toContain("ios-parity");
    expect(structural).not.toContain("workflow_dispatch");
    expect(workflow).toContain(
      "group: ci-mobile-ios-parity-${{ github.event.pull_request.number || github.ref }}",
    );
    expect(iosSimulator).not.toContain("github-script");
    expect(iosSimulator).not.toContain("issues.addLabels");
  });

  test("oxlint warning cap stays 455", () => {
    expect(packageJson.scripts.lint).toBe("oxlint --max-warnings=455");
  });
});
