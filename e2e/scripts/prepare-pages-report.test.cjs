const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, expect, test } = require("bun:test");
const {
  pagesOwnerHost,
  preparePagesReport,
  shouldPublishPageFile,
} = require("./prepare-pages-report.cjs");

describe("prepare-pages-report", () => {
  test("lowercases Pages owner host", () => {
    expect(pagesOwnerHost("AruNi-01")).toBe("aruni-01");
  });

  test("excludes heavy Playwright attachments from Pages", () => {
    expect(shouldPublishPageFile("data/trace.zip")).toBe(false);
    expect(shouldPublishPageFile("data/video.webm")).toBe(false);
    expect(shouldPublishPageFile("data/shot.png")).toBe(true);
    expect(shouldPublishPageFile("index.html")).toBe(true);
  });

  test("builds a slim site with retention and lowercase report URL", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "atmos-pages-"));
    const sourceDir = path.join(root, "merged");
    const existingRoot = path.join(root, "existing");
    const siteRoot = path.join(root, "site");

    fs.mkdirSync(path.join(sourceDir, "data"), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "index.html"), "<html>new</html>");
    fs.writeFileSync(path.join(sourceDir, "data", "keep.png"), "png");
    fs.writeFileSync(path.join(sourceDir, "data", "drop.webm"), "webm");
    fs.writeFileSync(path.join(sourceDir, "data", "drop.zip"), "zip");

    const oldRun = path.join(existingRoot, "e2e-reports", "pr-160", "run-100");
    fs.mkdirSync(oldRun, { recursive: true });
    fs.writeFileSync(path.join(oldRun, "index.html"), "<html>old</html>");
    fs.writeFileSync(path.join(oldRun, "trace.zip"), "zip");

    const staleRun = path.join(existingRoot, "e2e-reports", "pr-160", "run-50");
    fs.mkdirSync(staleRun, { recursive: true });
    fs.writeFileSync(path.join(staleRun, "index.html"), "<html>stale</html>");

    const olderRun = path.join(existingRoot, "e2e-reports", "pr-160", "run-40");
    fs.mkdirSync(olderRun, { recursive: true });
    fs.writeFileSync(path.join(olderRun, "index.html"), "<html>older</html>");

    const ancientRun = path.join(existingRoot, "e2e-reports", "pr-160", "run-10");
    fs.mkdirSync(ancientRun, { recursive: true });
    fs.writeFileSync(path.join(ancientRun, "index.html"), "<html>ancient</html>");

    const result = preparePagesReport({
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REPOSITORY: "AruNi-01/atmos",
      GITHUB_REPOSITORY_OWNER: "AruNi-01",
      GITHUB_RUN_ID: "200",
      PR_NUMBER: "160",
      PAGES_SOURCE_DIR: sourceDir,
      PAGES_EXISTING_ROOT: existingRoot,
      PAGES_SITE_ROOT: siteRoot,
    });

    expect(result.reportPath).toBe("e2e-reports/pr-160/run-200");
    expect(result.reportUrl).toBe(
      "https://aruni-01.github.io/atmos/e2e-reports/pr-160/run-200/",
    );
    expect(fs.existsSync(path.join(siteRoot, "e2e-reports/pr-160/run-200/index.html"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(siteRoot, "e2e-reports/pr-160/run-200/data/keep.png"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(siteRoot, "e2e-reports/pr-160/run-200/data/drop.webm"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(siteRoot, "e2e-reports/pr-160/run-200/data/drop.zip"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(siteRoot, "e2e-reports/pr-160/run-100/index.html"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(siteRoot, "e2e-reports/pr-160/run-100/trace.zip"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(siteRoot, "e2e-reports/pr-160/run-50/index.html"))).toBe(true);
    // Current run + 2 priors = RETAIN_RUNS_PER_GROUP (3). Older priors are dropped.
    expect(fs.existsSync(path.join(siteRoot, "e2e-reports/pr-160/run-40/index.html"))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(siteRoot, "e2e-reports/pr-160/run-10/index.html"))).toBe(
      false,
    );

    const retainedRuns = fs
      .readdirSync(path.join(siteRoot, "e2e-reports/pr-160"))
      .filter((name) => /^run-\d+$/.test(name))
      .sort();
    expect(retainedRuns).toEqual(["run-100", "run-200", "run-50"]);
  });
});
