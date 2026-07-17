const { describe, expect, test } = require("bun:test");
const {
  REPORT_COMMENT_EXPIRED_MARKER,
  REPORT_COMMENT_MARKER,
  buildExpiredPrCommentBody,
  buildPrCommentBody,
  extractReportUrl,
  isE2eReportComment,
  isExpiredE2eReportComment,
} = require("./e2e-report-utils.cjs");

describe("e2e-report-utils PR comments", () => {
  test("builds a current report comment with run id", () => {
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

    expect(body).toContain(REPORT_COMMENT_MARKER);
    expect(body).not.toContain(REPORT_COMMENT_EXPIRED_MARKER);
    expect(body).toContain("## E2E report");
    expect(body).toContain("- Run: `123`");
    expect(body).toContain("[Open report](https://example.test/report/)");
    expect(body).toContain("All selected E2E suites passed.");
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
    expect(expired).toContain("Superseded by run: `222`");
    expect(extractReportUrl(expired)).toBe("https://example.test/old-report/");
  });
});
