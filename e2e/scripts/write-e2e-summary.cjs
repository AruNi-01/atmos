const fs = require("node:fs");
const { buildSummaryMarkdown, readJsonReport } = require("./e2e-report-utils.cjs");

const resultsPath = process.env.RESULTS_PATH || "reports/merged/results.json";
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

if (!summaryPath) {
  throw new Error("GITHUB_STEP_SUMMARY is required");
}

const report = readJsonReport(resultsPath);
if (!report) {
  fs.appendFileSync(
    summaryPath,
    "### Playwright summary\n\nMerged JSON report was not generated.\n",
  );
  process.exit(0);
}

fs.appendFileSync(summaryPath, `${buildSummaryMarkdown(report)}\n`);
