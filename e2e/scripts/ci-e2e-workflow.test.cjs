const fs = require("node:fs");
const path = require("node:path");
const { describe, expect, test } = require("bun:test");

const workflowPath = path.resolve(__dirname, "../../.github/workflows/ci-e2e.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");

function blockBeforeJobs(source) {
  const jobsAt = source.search(/^jobs:\s*$/m);
  if (jobsAt < 0) {
    throw new Error("ci-e2e.yml has no top-level jobs: key");
  }
  return source.slice(0, jobsAt);
}

function extractConcurrency(source) {
  const match = source.match(/^[ \t]*concurrency:\n((?:[ \t]+.*\n)*)/m);
  if (!match) {
    throw new Error("missing concurrency block");
  }
  return match[1];
}

function jobBody(source, id) {
  const start = source.search(new RegExp(`^  ${id}:\\s*$`, "m"));
  if (start < 0) {
    throw new Error(`missing job ${id}`);
  }
  const rest = source.slice(start);
  const next = rest.slice(1).search(/^  [A-Za-z0-9_-]+:\s*$/m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

describe("ci-e2e workflow concurrency (QUALITY-019)", () => {
  const root = blockBeforeJobs(workflow);
  const concurrency = extractConcurrency(root);

  test("cancel-in-progress is true only for pull_request", () => {
    expect(concurrency).toMatch(
      /cancel-in-progress:\s*\$\{\{\s*github\.event_name\s*==\s*'pull_request'\s*\}\}/,
    );
    expect(concurrency).not.toMatch(/cancel-in-progress:\s*true\b/);
  });

  test("group keeps PR number or github.ref, not run_id", () => {
    expect(concurrency).toMatch(
      /group:\s*ci-e2e-\$\{\{\s*github\.workflow\s*\}\}-\$\{\{\s*github\.event\.pull_request\.number\s*\|\|\s*github\.ref\s*\}\}/,
    );
    expect(concurrency).not.toMatch(/github\.run_id/);
  });

  test("merge Pages concurrency still does not cancel in-progress", () => {
    expect(workflow).toMatch(/group:\s*ci-e2e-pages-report/);
    const mergeSlice = workflow.slice(workflow.indexOf("name: Merge reports"));
    const mergeConcurrency = extractConcurrency(mergeSlice);
    expect(mergeConcurrency).toMatch(/cancel-in-progress:\s*false/);
  });
});

describe("ci-e2e prebuilt API artifact (QUALITY-020)", () => {
  const build = jobBody(workflow, "build");
  const run = jobBody(workflow, "run");
  const setupE2e = fs.readFileSync(
    path.resolve(__dirname, "../../.github/actions/setup-e2e/action.yml"),
    "utf8",
  );
  const justfile = fs.readFileSync(path.resolve(__dirname, "../../justfile"), "utf8");

  test("build job compiles api once", () => {
    expect(build).toContain("cargo build --bin api");
    expect(build).toContain("Swatinem/rust-cache@v2");
    expect(build).toMatch(/workspaces:\s*"\. -> target"/);
    expect(build).toMatch(/cache-on-failure:\s*true/);
  });

  test("run shards need the build artifact and do not compile", () => {
    expect(run).toMatch(/needs:\s*\[plan, build\]/);
    expect(run).toContain("actions/download-artifact@v4");
    expect(run).toContain("e2e-api-debug-bin");
    expect(run).not.toContain("cargo build --bin api");
    expect(run).not.toContain("cargo run --bin api");
  });

  test("artifact pack/restore keeps execute bits", () => {
    expect(build).toMatch(/tar -C target\/debug -cvf api-bin\.tar api/);
    expect(run).toMatch(/tar -C target\/debug -xvf/);
    expect(run).toContain("chmod +x target/debug/api");
    expect(run.indexOf("uses: ./.github/actions/setup-e2e")).toBeGreaterThan(-1);
    expect(run.indexOf("Restore prebuilt API binary")).toBeGreaterThan(
      run.indexOf("uses: ./.github/actions/setup-e2e"),
    );
  });

  test("shards skip rust toolchain and rust-cache", () => {
    expect(run).toContain("uses: ./.github/actions/setup-e2e");
    expect(run).toMatch(/with-rust:\s*false/);
    expect(run).not.toContain("dtolnay/rust-toolchain");
    expect(run).not.toContain("Swatinem/rust-cache@v2");
    expect(setupE2e).toMatch(/default:\s*"true"/);
    const rustGuards = setupE2e.match(/inputs\.with-rust\s*==\s*'true'/g) ?? [];
    expect(rustGuards).toHaveLength(2);
    expect(setupE2e).toContain("dtolnay/rust-toolchain@stable");
    expect(setupE2e).toContain("Swatinem/rust-cache@v2");
    expect(setupE2e).toMatch(/workspaces:\s*"\. -> target"/);
    expect(setupE2e).toMatch(/cache-on-failure:\s*true/);
  });

  test("run job exports ATMOS_API_BIN and justfile execs it", () => {
    expect(run).toMatch(/ATMOS_API_BIN:\s*\$\{\{\s*github\.workspace\s*\}\}\/target\/debug\/api/);
    expect(justfile).toContain('exec "${ATMOS_API_BIN}"');
    expect(justfile).toContain("ATMOS_API_BIN is not executable");
  });
});
