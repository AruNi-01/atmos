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
