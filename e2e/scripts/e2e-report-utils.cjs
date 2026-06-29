const fs = require("node:fs");

const REPORT_COMMENT_MARKER = "<!-- atmos-e2e-report -->";

function readJsonReport(resultsPath) {
  if (!fs.existsSync(resultsPath)) return null;
  return JSON.parse(fs.readFileSync(resultsPath, "utf8"));
}

function collectFailures(report) {
  const failures = [];

  function walkSuite(suite) {
    for (const spec of suite.specs || []) {
      if (spec.ok === false) {
        const firstTest = (spec.tests || [])[0] || {};
        const firstResult = (firstTest.results || [])[0] || {};
        const firstError = firstResult.error || (firstResult.errors || [])[0];
        failures.push({
          title: spec.title,
          project: firstTest.projectName || firstTest.projectId || "unknown",
          message: firstError?.message
            ? firstError.message.split("\n")[0]
            : "See HTML report for details.",
        });
      }
    }
    for (const child of suite.suites || []) {
      walkSuite(child);
    }
  }

  for (const suite of report.suites || []) {
    walkSuite(suite);
  }

  return failures;
}

function appendFailureLines(lines, failures, heading = "#### Failed specs") {
  if (failures.length === 0) return;

  lines.push("", heading, "");
  for (const failure of failures.slice(0, 10)) {
    lines.push(`- [${failure.project}] ${failure.title} - ${failure.message}`);
  }
  if (failures.length > 10) {
    lines.push(`- ...and ${failures.length - 10} more failures in the HTML report`);
  }
}

function buildSummaryMarkdown(report) {
  const stats = report.stats || {};
  const failures = collectFailures(report);
  const lines = [
    "### Playwright summary",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Expected | ${stats.expected ?? 0} |`,
    `| Unexpected | ${stats.unexpected ?? 0} |`,
    `| Flaky | ${stats.flaky ?? 0} |`,
    `| Skipped | ${stats.skipped ?? 0} |`,
    `| Duration | ${Math.round((stats.duration ?? 0) / 1000)}s |`,
    "",
    "- Merged HTML report artifact: `playwright-html-report`",
    "- Raw matrix blob artifacts: `playwright-blob-*`",
    "- GitHub Actions artifacts are downloadable archives; direct in-browser HTML viewing is provided via GitHub Pages when this workflow publishes a Pages report.",
  ];

  appendFailureLines(lines, failures);
  return lines.join("\n");
}

function buildPrCommentBody(report, reportUrl) {
  const stats = report.stats || {};
  const failures = collectFailures(report);
  const lines = [
    REPORT_COMMENT_MARKER,
    "## E2E report",
    "",
    `- HTML report: [Open report](${reportUrl})`,
    `- Expected: ${stats.expected ?? 0}`,
    `- Unexpected: ${stats.unexpected ?? 0}`,
    `- Flaky: ${stats.flaky ?? 0}`,
    `- Skipped: ${stats.skipped ?? 0}`,
    `- Duration: ${Math.round((stats.duration ?? 0) / 1000)}s`,
  ];

  if (failures.length > 0) {
    appendFailureLines(lines, failures, "### Failed specs");
  } else {
    lines.push("", "All selected E2E suites passed.");
  }

  return lines.join("\n");
}

module.exports = {
  REPORT_COMMENT_MARKER,
  buildPrCommentBody,
  buildSummaryMarkdown,
  readJsonReport,
};
