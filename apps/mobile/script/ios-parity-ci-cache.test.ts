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

const onBlock = sectionBetween(workflow, "\non:\n", "\nconcurrency:\n");
const structural = sectionBetween(workflow, "  structural:\n", "  ios-simulator:\n");
const iosSimulator = workflow.slice(workflow.indexOf("  ios-simulator:\n"));
const cocoapodsRestore = sectionBetween(
  iosSimulator,
  "      - name: Restore CocoaPods cache\n",
  "      - name: Install CocoaPods\n",
);
const deriveddataRestore = sectionBetween(
  iosSimulator,
  "      - name: Restore DerivedData cache\n",
  "      - name: Build Release simulator app\n",
);
const cocoapodsSave = sectionBetween(
  iosSimulator,
  "      - name: Save CocoaPods cache\n",
  "      - name: Restore DerivedData cache\n",
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

describe("QUALITY-020 ios-simulator caches", () => {
  test("CocoaPods restore and save cover Pods and the CocoaPods cache dir", () => {
    for (const block of [cocoapodsRestore, cocoapodsSave]) {
      expect(block).toContain("actions/cache/");
      expect(block).toContain("@v4");
      expect(block).toContain("apps/mobile/ios/Pods");
      expect(block).toContain("~/Library/Caches/CocoaPods");
    }
    expect(cocoapodsRestore).toContain("actions/cache/restore@v4");
    expect(cocoapodsSave).toContain("actions/cache/save@v4");
  });

  test("DerivedData restore and save use the same artifacts/derived path as xcodebuild", () => {
    expect(iosSimulator).toContain("DERIVED_DATA: ${{ github.workspace }}/artifacts/derived");
    expect(deriveddataRestore).toContain("actions/cache/restore@v4");
    expect(deriveddataRestore).toContain("path: ${{ env.DERIVED_DATA }}");
    expect(deriveddataSave).toContain("actions/cache/save@v4");
    expect(deriveddataSave).toContain("path: ${{ env.DERIVED_DATA }}");
    expect(buildStep).toContain("-derivedDataPath");
    expect(buildStep).toContain('derived="${DERIVED_DATA:-$GITHUB_WORKSPACE/artifacts/derived}"');
    expect(buildStep).not.toContain('rm -rf "$derived"');
    expect(buildStep).not.toContain('rm -rf "$DERIVED_DATA"');
    expect(iosSimulator).not.toContain('rm -rf "$derived"');
  });

  test("cache keys include os, Xcode version, scope, bun.lock, and Podfile / Podfile.lock", () => {
    expect(iosSimulator).toContain("id: xcode");
    expect(iosSimulator).toContain('echo "version=${xcode_version}" >> "$GITHUB_OUTPUT"');
    expect(iosSimulator).toContain("xcodebuild -version");
    expect(iosSimulator).toContain('[[ "${PR_NUMBER}" =~ ^[0-9]+$ ]]');
    expect(iosSimulator).toContain('echo "scope=pr-${PR_NUMBER}" >> "$GITHUB_OUTPUT"');
    expect(iosSimulator).toContain('echo "scope=ref-${sanitized}" >> "$GITHUB_OUTPUT"');

    const podsKey =
      "ios-pods-${{ runner.os }}-${{ steps.xcode.outputs.version }}-${{ steps.xcode.outputs.scope }}-${{ hashFiles('bun.lock') }}-${{ hashFiles('apps/mobile/ios/Podfile') }}";
    expect(cocoapodsRestore).toContain(`key: ${podsKey}`);
    expect(cocoapodsSave).toContain(`key: ${podsKey}`);

    const ddKey =
      "ios-dd-${{ runner.os }}-${{ steps.xcode.outputs.version }}-${{ steps.xcode.outputs.scope }}-${{ hashFiles('bun.lock') }}-${{ hashFiles('apps/mobile/ios/Podfile.lock') }}";
    expect(deriveddataRestore).toContain(`key: ${ddKey}`);
    expect(deriveddataSave).toContain(`key: ${ddKey}`);
  });

  test("restore-keys fall back from bun.lock+scope to xcode to runner.os", () => {
    function restoreKeyLines(block: string): string[] {
      const marker = "restore-keys: |";
      const start = block.indexOf(marker);
      expect(start).toBeGreaterThan(-1);
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
    expect(restoreKeyLines(cocoapodsRestore)).toEqual([
      "ios-pods-${{ runner.os }}-${{ steps.xcode.outputs.version }}-${{ steps.xcode.outputs.scope }}-${{ hashFiles('bun.lock') }}-",
      "ios-pods-${{ runner.os }}-${{ steps.xcode.outputs.version }}-${{ steps.xcode.outputs.scope }}-",
      "ios-pods-${{ runner.os }}-${{ steps.xcode.outputs.version }}-",
      "ios-pods-${{ runner.os }}-",
    ]);
    expect(restoreKeyLines(deriveddataRestore)).toEqual([
      "ios-dd-${{ runner.os }}-${{ steps.xcode.outputs.version }}-${{ steps.xcode.outputs.scope }}-${{ hashFiles('bun.lock') }}-",
      "ios-dd-${{ runner.os }}-${{ steps.xcode.outputs.version }}-${{ steps.xcode.outputs.scope }}-",
      "ios-dd-${{ runner.os }}-${{ steps.xcode.outputs.version }}-",
      "ios-dd-${{ runner.os }}-",
    ]);
  });

  test("DerivedData is pruned and saved before capture; CocoaPods is saved after pod install", () => {
    expect(buildStep).toContain("COMPILER_INDEX_STORE_ENABLE=NO");
    expect(iosSimulator).toContain('rm -rf "${DERIVED_DATA}/Logs" "${DERIVED_DATA}/Index.noindex"');
    const podInstallAt = iosSimulator.indexOf("      - name: Install CocoaPods\n");
    const podsSaveAt = iosSimulator.indexOf("      - name: Save CocoaPods cache\n");
    const xcodebuildAt = iosSimulator.indexOf("      - name: Build Release simulator app\n");
    const pruneAt = iosSimulator.indexOf("      - name: Prune DerivedData before cache save\n");
    const ddSaveAt = iosSimulator.indexOf("      - name: Save DerivedData cache\n");
    const captureAt = iosSimulator.indexOf("      - name: Install, launch, and capture\n");
    expect(podInstallAt).toBeGreaterThan(-1);
    expect(podsSaveAt).toBeGreaterThan(podInstallAt);
    expect(xcodebuildAt).toBeGreaterThan(podsSaveAt);
    expect(pruneAt).toBeGreaterThan(xcodebuildAt);
    expect(ddSaveAt).toBeGreaterThan(pruneAt);
    expect(captureAt).toBeGreaterThan(ddSaveAt);
    expect(cocoapodsSave).not.toContain("refs/heads/main");
    expect(deriveddataSave).not.toContain("refs/heads/main");
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
