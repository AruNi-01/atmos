const { describe, expect, test } = require("bun:test");
const {
  REPORT_COMMENT_EXPIRED_MARKER,
  REPORT_COMMENT_MARKER,
  buildExpiredPrCommentBody,
  buildPrCommentBody,
  extractReportUrl,
  formatDuration,
  isE2eReportComment,
  isExpiredE2eReportComment,
} = require("./e2e-report-utils.cjs");

const sampleReport = {
  stats: {
    expected: 3,
    unexpected: 1,
    flaky: 1,
    skipped: 1,
    duration: 125_000,
  },
  suites: [
    {
      title: "tests/smoke/settings/settings-modal.e2e.ts",
      file: "/repo/e2e/tests/smoke/settings/settings-modal.e2e.ts",
      specs: [
        {
          title: "opens settings",
          ok: true,
          file: "/repo/e2e/tests/smoke/settings/settings-modal.e2e.ts",
          tests: [{ projectName: "chromium", status: "expected", results: [] }],
        },
        {
          title: "flaky toggle",
          ok: true,
          file: "/repo/e2e/tests/smoke/settings/settings-modal.e2e.ts",
          tests: [{ projectName: "chromium", status: "flaky", results: [] }],
        },
      ],
      suites: [],
    },
    {
      title: "tests/smoke/workspace/workspace-sidebar-routes.e2e.ts",
      file: "/repo/e2e/tests/smoke/workspace/workspace-sidebar-routes.e2e.ts",
      specs: [
        {
          title: "boots workspace",
          ok: true,
          file: "/repo/e2e/tests/smoke/workspace/workspace-sidebar-routes.e2e.ts",
          tests: [{ projectName: "chromium", status: "expected", results: [] }],
        },
        {
          title: "sidebar deep link",
          ok: false,
          file: "/repo/e2e/tests/smoke/workspace/workspace-sidebar-routes.e2e.ts",
          tests: [
            {
              projectName: "chromium",
              status: "unexpected",
              results: [{ error: { message: "Timed out waiting for sidebar\nmore" } }],
            },
          ],
        },
        {
          title: "mobile only",
          ok: true,
          file: "/repo/e2e/tests/smoke/workspace/workspace-sidebar-routes.e2e.ts",
          tests: [{ projectName: "mobile-chromium", status: "skipped", results: [] }],
        },
      ],
      suites: [],
    },
  ],
};

describe("e2e-report-utils PR comments", () => {
  test("formats durations for quick scanning", () => {
    expect(formatDuration(12_000)).toBe("12s");
    expect(formatDuration(125_000)).toBe("2m 5s");
  });

  test("builds a structured overview comment with tables", () => {
    const body = buildPrCommentBody(sampleReport, "https://example.test/report/", {
      runId: "123",
      repository: "AruNi-01/atmos",
      suites: ["smoke-settings", "smoke-workspace"],
    });

    expect(body).toContain(REPORT_COMMENT_MARKER);
    expect(body).not.toContain(REPORT_COMMENT_EXPIRED_MARKER);
    expect(body).toContain("## E2E report: ❌ Failed");
    expect(body).toContain("**3 passed** · 1 failed · 1 flaky · 1 skipped · **2m 5s** · 60% pass rate");
    expect(body).toContain("### Run");
    expect(body).toContain("<details>");
    expect(body).toContain("<summary><strong>Overview</strong></summary>");
    expect(body).toContain("| Metric | Count |");
    expect(body).toContain("| Passed | 3 |");
    expect(body).toContain("| Failed | 1 |");
    expect(body).toContain("<summary><strong>By file</strong></summary>");
    expect(body).toContain("`tests/smoke/settings/settings-modal.e2e.ts`");
    expect(body).toContain("<summary><strong>By project</strong></summary>");
    expect(body).toContain("`chromium`");
    expect(body).toContain("<summary><strong>Failed specs</strong></summary>");
    expect(body).toContain("Timed out waiting for sidebar");
    expect(body).toContain("[`123`](https://github.com/AruNi-01/atmos/actions/runs/123)");
    expect(body).toContain("`smoke-settings`");
    expect(body).toContain("[Open report](https://example.test/report/)");
    expect(body).toContain("Open the HTML report for traces, screenshots, and videos.");
    expect(body).not.toContain("<details open");
  });

  test("builds a passing comment without failure tables", () => {
    const body = buildPrCommentBody(
      {
        stats: {
          expected: 21,
          unexpected: 0,
          flaky: 0,
          skipped: 0,
          duration: 12_000,
        },
        suites: [],
      },
      "https://example.test/report/",
      { runId: "123" },
    );

    expect(body).toContain("## E2E report: ✅ Passed");
    expect(body).toContain("All selected E2E suites passed.");
    expect(body).toContain("<summary><strong>Overview</strong></summary>");
    expect(body).not.toContain("<summary><strong>Failed specs</strong></summary>");
  });

  test("marks previous comments as expired while keeping the old report link", () => {
    const previous = buildPrCommentBody(
      {
        stats: {
          expected: 10,
          unexpected: 1,
          flaky: 0,
          skipped: 0,
          duration: 5_000,
        },
        suites: [],
      },
      "https://example.test/old-report/",
      { runId: "111" },
    );
    const expired = buildExpiredPrCommentBody(previous, {
      supersededByRunId: "222",
    });

    expect(isE2eReportComment(previous)).toBe(true);
    expect(isExpiredE2eReportComment(previous)).toBe(false);
    expect(isE2eReportComment(expired)).toBe(true);
    expect(isExpiredE2eReportComment(expired)).toBe(true);
    expect(expired).toContain("## E2E report (expired)");
    expect(expired).toContain("`222`");
    expect(extractReportUrl(expired)).toBe("https://example.test/old-report/");
  });
});
