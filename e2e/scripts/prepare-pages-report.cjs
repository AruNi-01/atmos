const fs = require("node:fs");
const path = require("node:path");

/** Heavy Playwright attachments that bloat GitHub Pages past the ~1GB soft limit. */
const EXCLUDED_PAGE_EXTENSIONS = new Set([".webm", ".zip"]);

/** Keep this many recent run dirs per report group (pr-N / branch-X / manual-X). */
const RETAIN_RUNS_PER_GROUP = 3;

function pagesOwnerHost(owner) {
  return String(owner || "").toLowerCase();
}

function shouldPublishPageFile(filePath) {
  return !EXCLUDED_PAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function copyReportDir(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(sourceDir, entry.name);
    const to = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyReportDir(from, to);
      continue;
    }
    if (!shouldPublishPageFile(from)) continue;
    fs.copyFileSync(from, to);
  }
}

function listRunDirs(groupDir) {
  if (!fs.existsSync(groupDir)) return [];
  return fs
    .readdirSync(groupDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^run-\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => Number(b.slice(4)) - Number(a.slice(4)));
}

function retainExistingReports(existingRoot, siteRoot, currentReportPath) {
  const reportsRoot = path.join(existingRoot, "e2e-reports");
  if (!fs.existsSync(reportsRoot)) return;

  for (const group of fs.readdirSync(reportsRoot, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    const groupSource = path.join(reportsRoot, group.name);
    const runNames = listRunDirs(groupSource);
    const keep = runNames.slice(0, RETAIN_RUNS_PER_GROUP);

    for (const runName of keep) {
      const relative = path.join("e2e-reports", group.name, runName);
      if (relative === currentReportPath) continue;
      copyReportDir(path.join(groupSource, runName), path.join(siteRoot, relative));
    }
  }
}

function buildSiteIndexHtml(repoName, reportPath) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Atmos E2E Reports</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 40px; color: #111827; }
      a { color: #2563eb; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <h1>Atmos E2E Reports</h1>
    <p>Latest report published by this workflow:</p>
    <p><a href="/${repoName}/${reportPath}/">${reportPath}</a></p>
    <p>This Pages site stores static Playwright HTML reports for GitHub workflow runs.</p>
    <p>Videos and trace zips are omitted from Pages to stay under the site size limit; download the workflow artifacts for full attachments.</p>
  </body>
</html>`;
}

function preparePagesReport(env = process.env) {
  const eventName = env.GITHUB_EVENT_NAME;
  const repo = env.GITHUB_REPOSITORY || "";
  const owner = env.GITHUB_REPOSITORY_OWNER;
  const repoName = repo.split("/")[1];
  const runId = env.GITHUB_RUN_ID;
  const refName = (env.GITHUB_REF_NAME || "manual").replace(/[^a-zA-Z0-9._-]+/g, "-");
  const prNumber = env.PR_NUMBER;
  const existingRoot = path.resolve(
    env.PAGES_EXISTING_ROOT || path.join("reports", "gh-pages-existing"),
  );
  const sourceDir = path.resolve(env.PAGES_SOURCE_DIR || path.join("reports", "merged", "html"));
  const siteRoot = path.resolve(env.PAGES_SITE_ROOT || path.join("reports", "pages-site"));

  if (!owner || !repoName || !runId) {
    throw new Error("Missing GitHub repository metadata for Pages report");
  }
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Missing Playwright HTML report directory: ${sourceDir}`);
  }

  let reportPath;
  if (eventName === "pull_request" && prNumber) {
    reportPath = `e2e-reports/pr-${prNumber}/run-${runId}`;
  } else if (eventName === "push") {
    reportPath = `e2e-reports/branch-${refName}/run-${runId}`;
  } else {
    reportPath = `e2e-reports/manual-${refName}/run-${runId}`;
  }

  const reportUrl = `https://${pagesOwnerHost(owner)}.github.io/${repoName}/${reportPath}/`;

  fs.rmSync(siteRoot, { recursive: true, force: true });
  fs.mkdirSync(siteRoot, { recursive: true });
  retainExistingReports(existingRoot, siteRoot, reportPath);
  copyReportDir(sourceDir, path.join(siteRoot, reportPath));
  fs.writeFileSync(path.join(siteRoot, ".nojekyll"), "");
  fs.writeFileSync(path.join(siteRoot, "index.html"), buildSiteIndexHtml(repoName, reportPath), "utf8");

  return { reportPath, reportUrl, siteRoot };
}

if (require.main === module) {
  const { reportPath, reportUrl } = preparePagesReport();
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `report_path=${reportPath}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `report_url=${reportUrl}\n`);
  } else {
    process.stdout.write(`${reportUrl}\n`);
  }
}

module.exports = {
  EXCLUDED_PAGE_EXTENSIONS,
  RETAIN_RUNS_PER_GROUP,
  copyReportDir,
  pagesOwnerHost,
  preparePagesReport,
  shouldPublishPageFile,
};
