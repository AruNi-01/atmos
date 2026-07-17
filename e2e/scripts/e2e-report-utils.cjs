const fs = require("node:fs");
const path = require("node:path");

const REPORT_COMMENT_MARKER = "<!-- atmos-e2e-report -->";
const REPORT_COMMENT_EXPIRED_MARKER = "<!-- atmos-e2e-report:expired -->";

function readJsonReport(resultsPath) {
  if (!fs.existsSync(resultsPath)) return null;
  return JSON.parse(fs.readFileSync(resultsPath, "utf8"));
}

function emptyCounts() {
  return { passed: 0, failed: 0, flaky: 0, skipped: 0, total: 0 };
}

function recordStatus(counts, status) {
  counts.total += 1;
  if (status === "unexpected") counts.failed += 1;
  else if (status === "flaky") counts.flaky += 1;
  else if (status === "skipped") counts.skipped += 1;
  else counts.passed += 1;
}

function firstErrorMessage(test) {
  const firstResult = (test.results || [])[0] || {};
  const firstError = firstResult.error || (firstResult.errors || [])[0];
  if (!firstError?.message) return "See HTML report for details.";
  return String(firstError.message).split("\n")[0].trim();
}

function normalizeSpecFile(filePath) {
  if (!filePath) return "unknown";
  const normalized = String(filePath).replaceAll("\\", "/");
  const marker = "/e2e/";
  const idx = normalized.lastIndexOf(marker);
  if (idx >= 0) return normalized.slice(idx + marker.length);
  if (normalized.startsWith("tests/")) return normalized;
  return path.posix.basename(normalized);
}

function collectSpecResults(report) {
  const results = [];

  function walkSuite(suite) {
    for (const spec of suite.specs || []) {
      const tests = spec.tests || [];
      if (tests.length === 0) {
        const status = spec.ok === false ? "unexpected" : "expected";
        results.push({
          title: spec.title,
          file: normalizeSpecFile(spec.file || suite.file),
          project: "unknown",
          status,
          message: status === "unexpected" ? "See HTML report for details." : null,
        });
        continue;
      }

      for (const test of tests) {
        const status =
          test.status || (spec.ok === false ? "unexpected" : "expected");
        results.push({
          title: spec.title,
          file: normalizeSpecFile(spec.file || suite.file),
          project: test.projectName || test.projectId || "unknown",
          status,
          message: status === "unexpected" ? firstErrorMessage(test) : null,
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

  return results;
}

function collectFailures(report) {
  return collectSpecResults(report)
    .filter((result) => result.status === "unexpected")
    .map((result) => ({
      title: result.title,
      project: result.project,
      file: result.file,
      message: result.message || "See HTML report for details.",
    }));
}

function summarizeBy(results, key) {
  const map = new Map();
  for (const result of results) {
    const group = result[key] || "unknown";
    if (!map.has(group)) map.set(group, emptyCounts());
    recordStatus(map.get(group), result.status);
  }
  return [...map.entries()]
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round((ms ?? 0) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function resolveOverview(report, results) {
  const stats = report.stats || {};
  const counted = emptyCounts();
  for (const result of results) {
    recordStatus(counted, result.status);
  }

  const passed = stats.expected ?? counted.passed;
  const failed = stats.unexpected ?? counted.failed;
  const flaky = stats.flaky ?? counted.flaky;
  const skipped = stats.skipped ?? counted.skipped;
  const durationMs = stats.duration ?? 0;
  const executed = passed + failed + flaky;
  const passRate =
    executed === 0 ? 100 : Math.round((passed / executed) * 1000) / 10;
  const ok = failed === 0;

  return {
    ok,
    passed,
    failed,
    flaky,
    skipped,
    durationMs,
    passRate,
    statusLabel: ok ? "Passed" : "Failed",
    statusEmoji: ok ? "✅" : "❌",
  };
}

function parseSuites(suites) {
  if (Array.isArray(suites)) {
    return suites.map(String).filter(Boolean);
  }
  if (typeof suites === "string" && suites.trim()) {
    try {
      const parsed = JSON.parse(suites);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return suites
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function appendMarkdownTable(lines, headers, rows) {
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) {
    lines.push(`| ${row.join(" | ")} |`);
  }
}

function appendFailureLines(lines, failures, heading = "### Failed specs") {
  if (failures.length === 0) return;

  lines.push("", heading, "");
  appendMarkdownTable(
    lines,
    ["Project", "Spec", "Error"],
    failures.slice(0, 15).map((failure) => [
      `\`${failure.project}\``,
      failure.title.replaceAll("|", "\\|"),
      failure.message.replaceAll("|", "\\|"),
    ]),
  );
  if (failures.length > 15) {
    lines.push("", `_…and ${failures.length - 15} more failures in the HTML report._`);
  }
}

function appendBreakdownTable(lines, heading, groups) {
  if (groups.length === 0) return;
  lines.push("", heading, "");
  appendMarkdownTable(
    lines,
    ["Name", "Passed", "Failed", "Flaky", "Skipped"],
    groups.map((group) => [
      `\`${group.name}\``,
      String(group.passed),
      String(group.failed),
      String(group.flaky),
      String(group.skipped),
    ]),
  );
}

function buildReportSections(report, options = {}) {
  const results = collectSpecResults(report);
  const overview = resolveOverview(report, results);
  const failures = collectFailures(report);
  const byFile = summarizeBy(results, "file");
  const byProject = summarizeBy(results, "project");
  const suites = parseSuites(options.suites);
  const runId = options.runId ? String(options.runId) : null;
  const repository = options.repository ? String(options.repository) : null;
  const reportUrl = options.reportUrl || null;
  const duration = formatDuration(overview.durationMs);

  return {
    overview,
    failures,
    byFile,
    byProject,
    suites,
    runId,
    repository,
    reportUrl,
    duration,
  };
}

function buildSummaryMarkdown(report, options = {}) {
  const sections = buildReportSections(report, options);
  const { overview, failures, byFile, byProject, duration } = sections;
  const lines = [
    "### Playwright summary",
    "",
    `${overview.statusEmoji} **${overview.statusLabel}** · ${overview.passed} passed · ${overview.failed} failed · ${overview.flaky} flaky · ${overview.skipped} skipped · ${duration} · ${overview.passRate}% pass rate`,
    "",
  ];

  appendMarkdownTable(
    lines,
    ["Metric", "Value"],
    [
      ["Passed", String(overview.passed)],
      ["Failed", String(overview.failed)],
      ["Flaky", String(overview.flaky)],
      ["Skipped", String(overview.skipped)],
      ["Duration", duration],
      ["Pass rate", `${overview.passRate}%`],
    ],
  );

  appendBreakdownTable(lines, "#### By file", byFile);
  appendBreakdownTable(lines, "#### By project", byProject);

  lines.push(
    "",
    "- Merged HTML report artifact: `playwright-html-report`",
    "- Raw matrix blob artifacts: `playwright-blob-*`",
    "- GitHub Actions artifacts are downloadable archives; direct in-browser HTML viewing is provided via GitHub Pages when this workflow publishes a Pages report.",
  );

  appendFailureLines(lines, failures, "#### Failed specs");
  return lines.join("\n");
}

function isE2eReportComment(body) {
  return typeof body === "string" && body.includes(REPORT_COMMENT_MARKER);
}

function isExpiredE2eReportComment(body) {
  return typeof body === "string" && body.includes(REPORT_COMMENT_EXPIRED_MARKER);
}

function extractReportUrl(body) {
  if (typeof body !== "string") return null;
  const match = body.match(/\[Open report\]\(([^)\s]+)\)/);
  return match?.[1] ?? null;
}

function buildPrCommentBody(report, reportUrl, options = {}) {
  const sections = buildReportSections(report, { ...options, reportUrl });
  const {
    overview,
    failures,
    byFile,
    byProject,
    suites,
    runId,
    repository,
    duration,
  } = sections;

  const lines = [
    REPORT_COMMENT_MARKER,
    `## E2E report: ${overview.statusEmoji} ${overview.statusLabel}`,
    "",
    `**${overview.passed} passed** · ${overview.failed} failed · ${overview.flaky} flaky · ${overview.skipped} skipped · **${duration}** · ${overview.passRate}% pass rate`,
    "",
    "### Run",
    "",
  ];

  const metaRows = [];
  if (runId) {
    const runCell =
      repository != null
        ? `[\`${runId}\`](https://github.com/${repository}/actions/runs/${runId})`
        : `\`${runId}\``;
    metaRows.push(["Workflow run", runCell]);
  }
  if (suites.length > 0) {
    metaRows.push(["Selected suites", suites.map((suite) => `\`${suite}\``).join(", ")]);
  }
  metaRows.push(["HTML report", `[Open report](${reportUrl})`]);
  metaRows.push([
    "Artifacts",
    "`playwright-html-report`, `playwright-json-report` (14d) · videos/traces in artifacts only",
  ]);
  appendMarkdownTable(lines, ["Field", "Value"], metaRows);

  lines.push("", "### Overview", "");
  appendMarkdownTable(
    lines,
    ["Metric", "Count"],
    [
      ["Passed", String(overview.passed)],
      ["Failed", String(overview.failed)],
      ["Flaky", String(overview.flaky)],
      ["Skipped", String(overview.skipped)],
      ["Duration", duration],
      ["Pass rate", `${overview.passRate}%`],
    ],
  );

  appendBreakdownTable(lines, "### By file", byFile);
  appendBreakdownTable(lines, "### By project", byProject);
  appendFailureLines(lines, failures, "### Failed specs");

  if (failures.length === 0) {
    lines.push("", "All selected E2E suites passed.");
  } else {
    lines.push("", "Open the HTML report for traces, screenshots, and videos.");
  }

  return lines.join("\n");
}

function buildExpiredPrCommentBody(previousBody, options = {}) {
  const supersededByRunId = options.supersededByRunId
    ? String(options.supersededByRunId)
    : null;
  const previousUrl = extractReportUrl(previousBody);
  const lines = [
    REPORT_COMMENT_MARKER,
    REPORT_COMMENT_EXPIRED_MARKER,
    "## E2E report (expired)",
    "",
    "This report has been superseded by a newer CI - E2E run.",
    "",
  ];

  const rows = [];
  if (supersededByRunId) {
    rows.push(["Superseded by run", `\`${supersededByRunId}\``]);
  }
  if (previousUrl) {
    rows.push(["Previous HTML report", `[Open report](${previousUrl})`]);
  }
  if (rows.length > 0) {
    appendMarkdownTable(lines, ["Field", "Value"], rows);
  }

  return lines.join("\n");
}

module.exports = {
  REPORT_COMMENT_MARKER,
  REPORT_COMMENT_EXPIRED_MARKER,
  buildExpiredPrCommentBody,
  buildPrCommentBody,
  buildSummaryMarkdown,
  collectFailures,
  collectSpecResults,
  extractReportUrl,
  formatDuration,
  isE2eReportComment,
  isExpiredE2eReportComment,
  readJsonReport,
  resolveOverview,
};
