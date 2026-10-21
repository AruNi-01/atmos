import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = join(import.meta.dir, "../../..");
const workflowPath = join(root, ".github/workflows/ci-mobile-ios-parity.yml");
const workflow = readFileSync(workflowPath, "utf8");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts: { lint: string };
};

function sliceJob(name: string): string {
  const start = workflow.search(new RegExp(`^  ${name}:`, "m"));
  expect(start).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/^  [a-z0-9-]+:/m);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

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
const structural = sliceJob("structural");
const iosBuild = sliceJob("ios-build");
const iosSimulator = sliceJob("ios-simulator");
const iosMotion = sliceJob("ios-simulator-motion");
const iosRestore = sectionBetween(
  iosBuild,
  "      - name: Restore generated iOS tree\n",
  "      - name: Restore CocoaPods download cache\n",
);
const podhomeRestore = sectionBetween(
  iosBuild,
  "      - name: Restore CocoaPods download cache\n",
  "      - name: Prebuild iOS\n",
);
const prebuild = sectionBetween(
  iosBuild,
  "      - name: Prebuild iOS\n",
  "      - name: Install CocoaPods\n",
);
const podInstall = sectionBetween(
  iosBuild,
  "      - name: Install CocoaPods\n",
  "      - name: Verify generated iOS tree\n",
);
const buildStep = sectionBetween(
  iosBuild,
  "      - name: Build Release simulator app\n",
  "      - name: Save CocoaPods download cache\n",
);
const podhomeSave = sectionBetween(
  iosBuild,
  "      - name: Save CocoaPods download cache\n",
  "      - name: Save generated iOS tree\n",
);
const iosSave = sectionBetween(
  iosBuild,
  "      - name: Save generated iOS tree\n",
  "      - name: Write summary\n",
);
const summaryStep = sectionBetween(
  iosBuild,
  "      - name: Write summary\n",
  "      - name: Upload simulator app\n",
);

const iosGenKey =
  "ios-gen-${{ runner.os }}-${{ steps.xcode.outputs.version }}-${{ hashFiles('bun.lock', 'apps/mobile/package.json', 'apps/mobile/app.config.js', 'apps/mobile/app.json', 'apps/mobile/plugins/**', 'apps/mobile/modules/**', 'scripts/agent-chat-parity/exclude-dev-client.js', 'patches/**', '.github/workflows/ci-mobile-ios-parity.yml') }}";

const saveAfterBuildIf =
  "always() && !cancelled() && steps.ios-restore.outputs.cache-hit != 'true' && steps.xcodebuild.conclusion == 'success'";

describe("QUALITY-022 ios-build caches", () => {
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
    expect(iosBuild).toContain("      - name: Verify generated iOS tree\n");
    expect(iosBuild).toContain("id: ios-restore");
  });

  test("CocoaPods home cache is only for the miss path", () => {
    expect(podhomeRestore).toContain("~/Library/Caches/CocoaPods");
    expect(podhomeRestore).toContain("actions/cache/restore@v4");
    expect(restoreKeyLines(podhomeRestore)).toEqual([
      "ios-podhome-${{ runner.os }}-${{ steps.xcode.outputs.version }}-",
      "ios-podhome-${{ runner.os }}-",
    ]);
    expect(podhomeSave).toContain(saveAfterBuildIf);
    expect(iosBuild).not.toContain("ios-pods-");
  });

  test("DerivedData is not cached", () => {
    expect(iosBuild).not.toContain("ios-dd-");
    expect(iosBuild).not.toContain("deriveddata-restore");
    expect(iosBuild).not.toContain("Restore DerivedData cache");
    expect(iosBuild).not.toContain("Save DerivedData cache");
    expect(iosBuild).not.toContain("Normalize native input mtimes");
    expect(iosBuild).not.toContain("Prune DerivedData before cache save");
    expect(summaryStep).not.toContain("deriveddata cache-hit");
    expect(summaryStep).toContain("ios-gen cache-hit");
    expect(summaryStep).toContain("CompileC count");
  });

  test("xcodebuild writes a clean local derived path and counts CompileC", () => {
    expect(buildStep).toContain("-derivedDataPath");
    expect(buildStep).toContain('derived="$GITHUB_WORKSPACE/artifacts/derived"');
    expect(buildStep).toContain('rm -rf "$derived"');
    expect(buildStep).toContain("COMPILER_INDEX_STORE_ENABLE=NO");
    expect(buildStep).toContain('echo "compilec=${compilec}" >> "$GITHUB_OUTPUT"');
    expect(buildStep).toContain("generic/platform=iOS Simulator");
  });

  test("cache keys include os, Xcode version, patches, and the workflow file", () => {
    expect(iosBuild).toContain("id: xcode");
    expect(iosBuild).toContain('echo "version=${xcode_version}" >> "$GITHUB_OUTPUT"');
    expect(iosBuild).toContain("xcodebuild -version");
    expect(iosGenKey).toContain("patches/**");
    expect(iosGenKey).toContain(".github/workflows/ci-mobile-ios-parity.yml");
    expect(iosRestore).toContain("patches/**");
    expect(iosRestore).toContain(".github/workflows/ci-mobile-ios-parity.yml");
    expect(iosSave).toContain("patches/**");
    expect(iosSave).toContain(".github/workflows/ci-mobile-ios-parity.yml");
  });

  test("ios-gen key is not per-PR and save is not main-only", () => {
    expect(iosRestore).not.toContain("steps.xcode.outputs.scope");
    expect(iosSave).not.toContain("steps.xcode.outputs.scope");
    expect(iosGenKey).not.toContain("steps.xcode.outputs.scope");
    expect(iosSave).not.toContain("refs/heads/main");
    expect(podhomeSave).not.toContain("refs/heads/main");
    expect(onBlock).not.toMatch(/^\s*push:/m);
  });

  test("ios-gen save runs after successful xcodebuild", () => {
    const xcodebuildAt = iosBuild.indexOf("      - name: Build Release simulator app\n");
    const podhomeSaveAt = iosBuild.indexOf("      - name: Save CocoaPods download cache\n");
    const iosSaveAt = iosBuild.indexOf("      - name: Save generated iOS tree\n");
    const summaryAt = iosBuild.indexOf("      - name: Write summary\n");
    expect(xcodebuildAt).toBeGreaterThan(-1);
    expect(podhomeSaveAt).toBeGreaterThan(xcodebuildAt);
    expect(iosSaveAt).toBeGreaterThan(podhomeSaveAt);
    expect(summaryAt).toBeGreaterThan(iosSaveAt);
    expect(iosSave).toContain(saveAfterBuildIf);
    expect(podhomeSave).toContain(saveAfterBuildIf);
    expect(iosSave).toContain("steps.xcodebuild.conclusion == 'success'");
    expect(podhomeSave).toContain("steps.xcodebuild.conclusion == 'success'");
  });

  test("macos jobs stay opt-in; this workflow has no push trigger", () => {
    expect(onBlock).toContain("workflow_dispatch:");
    expect(onBlock).toContain("pull_request:");
    expect(onBlock).toContain("labeled");
    expect(onBlock).toContain("unlabeled");
    expect(onBlock).not.toMatch(/^\s*push:/m);
    for (const job of [iosBuild, iosSimulator, iosMotion]) {
      expect(job).toContain("github.event_name == 'workflow_dispatch'");
      expect(job).toContain("contains(github.event.pull_request.labels.*.name, 'ios-parity')");
    }
    expect(structural).not.toContain("ios-parity");
    expect(structural).not.toContain("workflow_dispatch");
    expect(workflow).toContain(
      "group: ci-mobile-ios-parity-${{ github.event.pull_request.number || github.ref }}",
    );
    expect(iosBuild).not.toContain("github-script");
    expect(iosBuild).not.toContain("issues.addLabels");
  });

  test("QUALITY-023 job graph keeps cache on ios-build", () => {
    expect(iosSimulator).toContain("needs: ios-build");
    expect(iosMotion).toContain("needs: [ios-build, ios-simulator]");
    expect(iosSimulator).not.toContain("Restore generated iOS tree");
    expect(iosMotion).not.toContain("Restore generated iOS tree");
    expect(iosSimulator).not.toContain("ios-gen-");
    expect(iosMotion).not.toContain("ios-gen-");
    expect(iosBuild).not.toContain(".xcode.env.local");
    expect(iosBuild).not.toContain("> .env");
    expect(iosBuild).not.toContain("ios-boot-simulator.sh");
  });

  test("oxlint warning cap stays 455", () => {
    expect(packageJson.scripts.lint).toBe("oxlint --max-warnings=455");
  });
});
