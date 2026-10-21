import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = join(import.meta.dir, "../../..");
const workflow = readFileSync(join(root, ".github/workflows/ci-mobile-ios-parity.yml"), "utf8");
const capture = readFileSync(join(root, "scripts/agent-chat-parity/ios-capture.sh"), "utf8");
const boot = readFileSync(join(root, "scripts/agent-chat-parity/ios-boot-simulator.sh"), "utf8");
const preview = readFileSync(
  join(root, "apps/mobile/src/features/agent-chat/preview-chat-screen.tsx"),
  "utf8",
);
const cycle = readFileSync(
  join(root, "apps/mobile/src/features/agent-chat/parity-cycle.ts"),
  "utf8",
);

function sliceJob(name: string): string {
  const start = workflow.search(new RegExp(`^  ${name}:`, "m"));
  expect(start).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/^  [a-z0-9-]+:/m);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
}

describe("QUALITY-023 iOS parity capture speed", () => {
  test("scripts parse", () => {
    for (const rel of [
      "scripts/agent-chat-parity/ios-capture.sh",
      "scripts/agent-chat-parity/ios-boot-simulator.sh",
    ]) {
      const result = spawnSync("bash", ["-n", join(root, rel)], { encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    }
  });

  test("shards cover stills and motion and default to all", () => {
    expect(capture).toContain('PARITY_SHARD="${PARITY_SHARD:-all}"');
    expect(capture).toContain("shard_stills()");
    expect(capture).toContain("shard_motion()");
    expect(capture).toContain('[[ "$PARITY_SHARD" == "all" || "$PARITY_SHARD" == "stills" ]]');
    expect(capture).toContain('[[ "$PARITY_SHARD" == "all" || "$PARITY_SHARD" == "motion" ]]');
    expect(capture).toContain("expected 26 fixture screenshots");
    expect(capture).toContain("capture_tail_away");
    expect(capture).toContain("capture_f12_pill_taps");
    expect(capture).toContain("capture_composer_keyboard");
    expect(workflow).toContain("shard: [stills, motion]");
    expect(workflow).toContain("ios-build:");
    expect(workflow).toContain("PARITY_SHARD: ${{ matrix.shard }}");
    expect(workflow).toContain("name: ios-parity-${{ matrix.shard }}");
    expect(workflow).toContain("name: ios-parity");
  });

  test("paint wait replaces the 15s fixture sleep", () => {
    expect(cycle).toContain("export function parityPaintedLine");
    expect(preview).toContain("parityPaintedLine");
    expect(preview).toContain("setTimeout(notePainted, 600)");
    expect(preview).toContain("setTimeout(notePainted, 8_000)");
    expect(capture).toContain('wait_for_since "[parity] painted ${id} ${theme}"');
    expect(capture).not.toContain("sleep 15");
  });

  test("PillTap is prebuilt on the motion shard", () => {
    expect(capture).toContain('PILL_TAP_ACTION="${PILL_TAP_ACTION:-test}"');
    expect(capture).toContain('xcodebuild "$PILL_TAP_ACTION"');
    expect(workflow).toContain("build-for-testing");
    expect(workflow).toContain('"$PARITY_SHARD" == "motion"');
    expect(workflow).toContain(
      "PILL_TAP_ACTION: ${{ matrix.shard == 'motion' && 'test-without-building' || 'test' }}",
    );
    expect(capture).toContain("PillTap missed:");
    expect(capture).not.toContain("A miss does not fail the job");
    expect(capture).toContain("installing or uninstalling");
    expect(capture).toContain("pill tap ${test_id} runner busy");
    expect(capture).toContain('wait_for_since "$needle" 120 "$mark"');
    expect(capture).not.toContain("install_pill_runner");
    expect(capture).toContain("PillTap destination missing:");
    expect(capture).toContain("wait_for_xcode_destination");
    expect(capture).toContain('wait_for_since "[parity] pill awaiting tap"');
    expect(capture).toContain("terminate_app");
    expect(capture).toContain("log-mark-epoch.txt");
    expect(capture).toContain("log_show_has_since");
    expect(capture).toContain('launch_frame "f13-tail" "light" "return"');
    const hasSince = capture.slice(
      capture.indexOf("log_has_since()"),
      capture.indexOf("\nlog_has()"),
    );
    expect(hasSince).not.toContain("device-log-fallback.txt");
    const sinceFn = capture.slice(
      capture.indexOf("wait_for_since()"),
      capture.indexOf("wait_for_line()"),
    );
    expect(sinceFn).toContain("refresh_parity_show");
    expect(sinceFn).toContain("log_show_has_since");
  });

  test("log show since filter keeps new lines and drops old ones", () => {
    const start = capture.indexOf("log_show_has_since()");
    const pyStart = capture.indexOf("import re\n", start);
    const pyEnd = capture.indexOf("\nPY\n", pyStart);
    const py = capture.slice(pyStart, pyEnd);
    expect(py).toContain("min_ts");
    const dir = mkdtempSync(join(tmpdir(), "parity-log-show-"));
    const logPath = join(dir, "device-log-fallback.txt");
    writeFileSync(
      logPath,
      [
        "2026-10-21 11:14:01.000000+0000  0x1  Atmos  [parity] preview-chat module",
        "2026-10-21 11:15:31.000000+0000  0x2  Atmos  [parity] preview-chat module",
      ].join("\n"),
    );
    const utcEpoch = (hour: number, minute: number, second: number) => {
      const result = spawnSync(
        "python3",
        [
          "-c",
          `from datetime import datetime, timezone; print(int(datetime(2026,10,21,${hour},${minute},${second},tzinfo=timezone.utc).timestamp()))`,
        ],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    const keepReturn = spawnSync(
      "python3",
      ["-c", py, logPath, "[parity] preview-chat module", utcEpoch(11, 14, 20)],
      { encoding: "utf8" },
    );
    expect(keepReturn.status, keepReturn.stderr).toBe(0);
    const afterBoth = spawnSync(
      "python3",
      ["-c", py, logPath, "[parity] preview-chat module", utcEpoch(11, 15, 40)],
      { encoding: "utf8" },
    );
    expect(afterBoth.status, afterBoth.stderr).toBe(1);
  });

  test("motion PillTap uses the booted UDID after boot, not a generic overlap", () => {
    const simJob = sliceJob("ios-simulator");
    expect(simJob).toContain("PARITY_UDID");
    expect(simJob).toContain("platform=iOS Simulator,id=${udid}");
    expect(simJob).not.toContain("pill_pid");
    expect(simJob).not.toContain("pill-tap-build.log");
    expect(sliceJob("ios-build")).toContain("generic/platform=iOS Simulator");
  });

  test("preview flag is step env only", () => {
    expect(workflow).not.toContain("printf 'EXPO_PUBLIC_PARITY_PREVIEW=1");
    expect(workflow).not.toContain(".xcode.env.local");
    expect(workflow).not.toContain("> .env");
    const buildJob = sliceJob("ios-build");
    const simJob = sliceJob("ios-simulator");
    const buildJobEnv = buildJob.slice(0, buildJob.indexOf("steps:"));
    const simJobEnv = simJob.slice(0, simJob.indexOf("steps:"));
    expect(buildJobEnv).not.toContain("EXPO_PUBLIC_PARITY_PREVIEW");
    expect(simJobEnv).not.toContain("EXPO_PUBLIC_PARITY_PREVIEW");
    expect(buildJob).toContain('EXPO_PUBLIC_PARITY_PREVIEW: "1"');
    expect(simJob).not.toContain("EXPO_PUBLIC_PARITY_PREVIEW");
    expect(workflow).toContain('EXPO_PUBLIC_PARITY_PREVIEW: "1"');
  });

  test("label gate, no evidence push, still mux 4s", () => {
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("contains(github.event.pull_request.labels.*.name, 'ios-parity')");
    expect(workflow).not.toContain("EVIDENCE_PUSH");
    expect(capture).toContain('RECORD_SECONDS="${RECORD_SECONDS:-4}"');
    expect(boot).toContain("ConnectHardwareKeyboard -bool false");
    expect(workflow).toContain("ios-boot-simulator.sh setup");
    expect(workflow).toContain("ios-boot-simulator.sh boot");
    expect(workflow).toContain("generic/platform=iOS Simulator");
    expect(sliceJob("ios-build")).toContain("oven-sh/setup-bun@v2");
    expect(sliceJob("ios-build")).not.toContain("./.github/actions/setup-bun");
    expect(sliceJob("ios-simulator")).toContain("oven-sh/setup-bun@v2");
    expect(sliceJob("structural")).toContain("./.github/actions/setup-bun");
    const structural = sliceJob("structural");
    expect(structural).not.toContain("ios-parity");
    expect(structural).not.toContain("workflow_dispatch");
    expect(structural).toContain("bash -n scripts/agent-chat-parity/ios-boot-simulator.sh");
  });
});
