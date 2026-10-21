import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = join(import.meta.dir, "../../..");
const evidenceSh = join(root, "apps/mobile/e2e/scripts/evidence.sh");
const justfile = readFileSync(join(root, "justfile"), "utf8");
const skill = readFileSync(join(root, ".agents/skills/verify-atmos-mobile/SKILL.md"), "utf8");
const workflow = readFileSync(join(root, ".github/workflows/ci-mobile-ios-parity.yml"), "utf8");
const evidenceSrc = readFileSync(evidenceSh, "utf8");

function run(
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

describe("evidence publish policy", () => {
  test("does not push unless EVIDENCE_PUSH=1, and meta has no host", () => {
    const cases: Array<{ env: Record<string, string | undefined>; push: boolean }> = [
      { env: {}, push: false },
      { env: { EVIDENCE_PUSH: "0" }, push: false },
      { env: { EVIDENCE_NO_PUSH: "1" }, push: false },
      { env: { EVIDENCE_PUSH: "1" }, push: true },
    ];
    for (const item of cases) {
      const out = mkdtempSync(join(tmpdir(), "evidence-policy-"));
      try {
        const result = run("bash", [evidenceSh, "315", 'he said "hi"'], {
          ...item.env,
          EVIDENCE_POLICY_PROBE: "1",
          EVIDENCE_POLICY_OUT: out,
        });
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout.trim()).toBe(item.push ? "PUSH" : "NO_PUSH");
        const meta = JSON.parse(readFileSync(join(out, "meta.json"), "utf8")) as Record<
          string,
          unknown
        >;
        expect(Object.hasOwn(meta, "host")).toBe(false);
        expect(Object.keys(meta).sort()).toEqual(
          ["agentDevice", "branch", "bundleId", "capturedAt", "device", "note", "pr", "sha"].sort(),
        );
        expect(meta.note).toBe('he said "hi"');
        expect(meta.pr).toBe(315);
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    }
  });

  test("meta.json stays valid when the note has newlines, backslashes, and quotes", () => {
    const note = 'line "one"\npath\\to\\file\nthird';
    const out = mkdtempSync(join(tmpdir(), "evidence-meta-"));
    try {
      const result = run("bash", [evidenceSh, "315", note], {
        EVIDENCE_POLICY_PROBE: "1",
        EVIDENCE_POLICY_OUT: out,
      });
      expect(result.status, result.stderr).toBe(0);
      const raw = readFileSync(join(out, "meta.json"), "utf8");
      const meta = JSON.parse(raw) as { note: string };
      expect(meta.note).toBe(note);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  test("git push stays behind the push guard and the script never reads a hostname", () => {
    expect(evidenceSrc).not.toContain("EVIDENCE_NO_PUSH");
    expect(evidenceSrc).not.toContain("scutil");
    expect(evidenceSrc).not.toContain("hostname");
    expect(evidenceSrc).not.toContain('"host"');
    expect(evidenceSrc).toContain("jq -n");
    const guard = evidenceSrc.indexOf("if ! evidence_should_push; then");
    const push = evidenceSrc.indexOf('git -C "$STAGE" push');
    expect(guard).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(guard);
  });
});

describe("just mobile-e2e-evidence quoting", () => {
  test("recipe uses positional arguments, not {{pr}} / {{note}}", () => {
    expect(justfile).toContain("set positional-arguments");
    expect(justfile).toContain('bash apps/mobile/e2e/scripts/evidence.sh "$1" "$2"');
    expect(justfile).not.toContain('evidence.sh "{{pr}}"');
    expect(justfile).not.toContain('evidence.sh "{{note}}"');
  });

  test("a note with $(...), semicolon, and quotes is not executed", () => {
    const marker = join(tmpdir(), `quality-010-inject-${process.pid}`);
    rmSync(marker, { force: true });
    const payload = `$(touch ${marker}); echo "a'b"; say "hi"`;
    // justfile sets `shell := ["zsh", "-cu"]`. Use just only when both exist
    // (local and the injection proof). CI structural is ubuntu without just
    // or zsh; bash still passes the note as argv, which is the script contract.
    const justOk = spawnSync("just", ["--version"], { encoding: "utf8" }).status === 0;
    const zshOk = spawnSync("zsh", ["-c", "exit 0"], { encoding: "utf8" }).status === 0;
    const result =
      justOk && zshOk
        ? run("just", ["mobile-e2e-evidence", "315", payload], { EVIDENCE_ARG_PROBE: "1" })
        : run("bash", [evidenceSh, "315", payload], { EVIDENCE_ARG_PROBE: "1" });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(marker)).toBe(false);
    const lines = result.stdout.split("\n");
    expect(lines).toContain("315");
    expect(lines).toContain(payload);
  });
});

describe("evidence skill and ios parity workflow", () => {
  test("skill warns that the evidence remote is public", () => {
    expect(skill).toContain("EVIDENCE_PUSH=1");
    expect(skill).toContain("PUBLIC repo");
    expect(skill).toContain("Do not push screenshots or chat content of a paired app");
    expect(skill).not.toContain("pushes screenshot");
  });

  test("ios-simulator is opt-in and the workflow cancels superseded PR runs", () => {
    expect(workflow).toContain(
      "group: ci-mobile-ios-parity-${{ github.event.pull_request.number || github.ref }}",
    );
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("contains(github.event.pull_request.labels.*.name, 'ios-parity')");
    const structural = workflow.slice(
      workflow.indexOf("structural:"),
      workflow.indexOf("ios-build:"),
    );
    expect(structural).not.toContain("ios-parity");
    expect(structural).not.toContain("workflow_dispatch");
    expect(workflow).toContain("ios-build:");
    expect(workflow).toContain("ios-simulator:");
    expect(workflow).toContain("ios-simulator-motion:");
  });
});

describe("oxlint static-components cap", () => {
  test("the DOM override keeps react/static-components at warn", () => {
    const config = readFileSync(join(root, ".oxlintrc.jsonc"), "utf8");
    const domStart = config.indexOf('"apps/web/**"');
    const domEnd = config.indexOf('"apps/landing/**", "apps/docs/src/app/og/**"');
    expect(domStart).toBeGreaterThan(-1);
    expect(domEnd).toBeGreaterThan(domStart);
    const domOverride = config.slice(domStart, domEnd);
    expect(domOverride).toContain('"react/static-components": "warn"');
    expect(domOverride).not.toContain('"react/static-components": "off"');
  });
});

describe("oxlint next/no-img-element directive", () => {
  test("next/no-img-element suppresses the diagnostic the config calls nextjs/no-img-element", () => {
    const probe = join(root, "apps/web/src/app-shell/_quality010_img_probe.tsx");
    const probeSource = `export function Suppressed() {
  // oxlint-disable-next-line next/no-img-element
  return <img src="/a.png" alt="" />;
}
export function Bare() {
  return <img src="/b.png" alt="" />;
}
`;
    try {
      writeFileSync(probe, probeSource);
      const result = run("bunx", ["oxlint", "--max-warnings=100000", "--format=unix", probe], {});
      expect(result.status, result.stderr + result.stdout).toBe(0);
      const hits = result.stdout.split("\n").filter((line) => line.includes("no-img-element"));
      expect(hits).toHaveLength(1);
      expect(hits[0]).toContain("next(no-img-element)");
      expect(hits[0]).toContain(":6:");
    } finally {
      rmSync(probe, { force: true });
    }
  });
});
