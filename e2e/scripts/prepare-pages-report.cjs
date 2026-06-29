const fs = require("node:fs");
const path = require("node:path");

const eventName = process.env.GITHUB_EVENT_NAME;
const repo = process.env.GITHUB_REPOSITORY || "";
const owner = process.env.GITHUB_REPOSITORY_OWNER;
const repoName = repo.split("/")[1];
const runId = process.env.GITHUB_RUN_ID;
const refName = (process.env.GITHUB_REF_NAME || "manual").replace(/[^a-zA-Z0-9._-]+/g, "-");
const prNumber = process.env.PR_NUMBER;

if (!owner || !repoName || !runId) {
  throw new Error("Missing GitHub repository metadata for Pages report");
}

let reportPath;
if (eventName === "pull_request" && prNumber) {
  reportPath = `e2e-reports/pr-${prNumber}/run-${runId}`;
} else if (eventName === "push") {
  reportPath = `e2e-reports/branch-${refName}/run-${runId}`;
} else {
  reportPath = `e2e-reports/manual-${refName}/run-${runId}`;
}

const reportUrl = `https://${owner}.github.io/${repoName}/${reportPath}/`;
const sourceDir = path.resolve("reports/merged/html");
const siteRoot = path.resolve("reports/pages-site");
const targetDir = path.join(siteRoot, reportPath);

fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });
fs.writeFileSync(path.join(siteRoot, ".nojekyll"), "");

const indexHtml = `<!doctype html>
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
  </body>
</html>`;
fs.writeFileSync(path.join(siteRoot, "index.html"), indexHtml, "utf8");

fs.appendFileSync(process.env.GITHUB_OUTPUT, `report_path=${reportPath}\n`);
fs.appendFileSync(process.env.GITHUB_OUTPUT, `report_url=${reportUrl}\n`);
