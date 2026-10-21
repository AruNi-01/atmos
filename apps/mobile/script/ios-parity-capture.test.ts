import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
    expect(capture).toContain('wait_for_line "[parity] painted ${id} ${theme}"');
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
    const structural = sliceJob("structural");
    expect(structural).not.toContain("ios-parity");
    expect(structural).not.toContain("workflow_dispatch");
    expect(structural).toContain("bash -n scripts/agent-chat-parity/ios-boot-simulator.sh");
  });
});
