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
const deriveddataRestore = sectionBetween(
  iosSimulator,
  "      - name: Restore DerivedData cache\n",
  "      - name: Normalize native input mtimes for incremental xcodebuild\n",
);
const deriveddataSave = sectionBetween(
  iosSimulator,
  "      - name: Save DerivedData cache\n",
  "      - name: Install, launch, and capture\n",
);
const buildStep = sectionBetween(
  iosSimulator,
  "      - name: Build Release simulator app\n",
  "      - name: Prune DerivedData before cache save\n",
);
const mtimeStep = sectionBetween(
  iosSimulator,
  "      - name: Normalize native input mtimes for incremental xcodebuild\n",
  "      - name: Build Release simulator app\n",
);

const iosGenKey =
  "ios-gen-${{ runner.os }}-${{ steps.xcode.outputs.version }}-${{ steps.xcode.outputs.scope }}-${{ hashFiles('bun.lock', 'apps/mobile/package.json', 'apps/mobile/app.config.js', 'apps/mobile/app.json', 'apps/mobile/plugins/**', 'apps/mobile/modules/**', 'scripts/agent-chat-parity/exclude-dev-client.js') }}";
const ddKey =
  "ios-dd-${{ runner.os }}-${{ steps.xcode.outputs.version }}-${{ steps.xcode.outputs.scope }}-${{ hashFiles('bun.lock') }}-${{ hashFiles('apps/mobile/ios/Podfile.lock') }}";

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

  test("DerivedData is exact-key only and shares -derivedDataPath", () => {
    expect(iosSimulator).toContain("DERIVED_DATA: ${{ github.workspace }}/artifacts/derived");
    expect(deriveddataRestore).toContain("actions/cache/restore@v4");
    expect(deriveddataRestore).toContain("path: ${{ env.DERIVED_DATA }}");
    expect(deriveddataRestore).toContain(`key: ${ddKey}`);
    expect(deriveddataRestore).not.toContain("restore-keys:");
    expect(deriveddataSave).toContain("actions/cache/save@v4");
    expect(deriveddataSave).toContain("path: ${{ env.DERIVED_DATA }}");
    expect(deriveddataSave).toContain(`key: ${ddKey}`);
    expect(buildStep).toContain("-derivedDataPath");
    expect(buildStep).toContain('derived="${DERIVED_DATA:-$GITHUB_WORKSPACE/artifacts/derived}"');
    expect(buildStep).not.toContain('rm -rf "$derived"');
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

  test("exact DerivedData hit pins native input mtimes to bun.lock", () => {
    expect(mtimeStep).toContain("steps.deriveddata-restore.outputs.cache-hit == 'true'");
    expect(mtimeStep).toContain("os.utime(path, times)");
    expect(mtimeStep).toContain('os.stat("bun.lock")');
    expect(mtimeStep).toContain("apps/mobile/ios");
    expect(mtimeStep).toContain("node_modules");
  });

  test("DerivedData is pruned and saved before capture", () => {
    expect(buildStep).toContain("COMPILER_INDEX_STORE_ENABLE=NO");
    expect(iosSimulator).toContain('rm -rf "${DERIVED_DATA}/Logs" "${DERIVED_DATA}/Index.noindex"');
    const xcodebuildAt = iosSimulator.indexOf("      - name: Build Release simulator app\n");
    const pruneAt = iosSimulator.indexOf("      - name: Prune DerivedData before cache save\n");
    const ddSaveAt = iosSimulator.indexOf("      - name: Save DerivedData cache\n");
    const captureAt = iosSimulator.indexOf("      - name: Install, launch, and capture\n");
    expect(xcodebuildAt).toBeGreaterThan(-1);
    expect(pruneAt).toBeGreaterThan(xcodebuildAt);
    expect(ddSaveAt).toBeGreaterThan(pruneAt);
    expect(captureAt).toBeGreaterThan(ddSaveAt);
    expect(deriveddataSave).not.toContain("refs/heads/main");
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
