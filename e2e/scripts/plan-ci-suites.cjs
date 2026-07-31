const fs = require("node:fs");

const smokeSuites = [
  "smoke-routes",
  "smoke-onboarding",
  "smoke-app-shell",
  "smoke-project",
  "smoke-settings",
  "smoke-workspace",
];

const manualTargets = {
  "all-smoke": smokeSuites,
  "smoke-stateless": ["smoke-stateless"],
  "smoke-stateful": ["smoke-stateful"],
  "smoke-routes": ["smoke-routes"],
  "smoke-onboarding": ["smoke-onboarding"],
  "smoke-app-shell": ["smoke-app-shell"],
  "smoke-project": ["smoke-project"],
  "smoke-settings": ["smoke-settings"],
  "smoke-workspace": ["smoke-workspace"],
  specs: ["specs"],
  full: ["full"],
};

const eventName = process.env.EVENT_NAME;
const gitRef = process.env.GITHUB_REF || "";
const isForkPr = process.env.IS_FORK_PR === "true";
const target = process.env.TARGET || "auto";
const flags = {
  anyFrontend: process.env.ANY_FRONTEND === "true",
  global: process.env.GLOBAL === "true",
  routes: process.env.ROUTES === "true",
  onboarding: process.env.ONBOARDING === "true",
  appShell: process.env.APP_SHELL === "true",
  project: process.env.PROJECT === "true",
  settings: process.env.SETTINGS === "true",
  workspace: process.env.WORKSPACE === "true",
  specs: process.env.SPECS === "true",
};

const suites = [];
const add = (suite) => {
  if (!suites.includes(suite)) {
    suites.push(suite);
  }
};
const addMany = (items) => items.forEach(add);

if (target !== "auto") {
  addMany(manualTargets[target] || []);
} else if (eventName === "workflow_dispatch") {
  addMany(smokeSuites);
} else if (flags.global) {
  // packages/**, app-shell providers, shared fixtures, etc. can break multi-client
  // transport/cutover journeys — always include specs when global paths change.
  addMany(smokeSuites);
  add("specs");
} else {
  if (flags.routes) add("smoke-routes");
  if (flags.onboarding) add("smoke-onboarding");
  if (flags.appShell) add("smoke-app-shell");
  if (flags.project) add("smoke-project");
  if (flags.settings) add("smoke-settings");
  if (flags.workspace) add("smoke-workspace");
  if (flags.specs) add("specs");

  if (flags.anyFrontend && suites.length === 0) {
    addMany(smokeSuites);
  }
}

const shouldRun = suites.length > 0;
const publishReport =
  shouldRun &&
  !isForkPr &&
  ((process.env.REQUESTED_PUBLISH_REPORT === "true" &&
    eventName === "workflow_dispatch") ||
    eventName === "pull_request" ||
    (eventName === "push" && gitRef === "refs/heads/main"));

fs.appendFileSync(
  process.env.GITHUB_OUTPUT,
  [
    `suites=${JSON.stringify(suites)}`,
    `should_run=${shouldRun}`,
    `publish_report=${publishReport}`,
  ].join("\n") + "\n",
);

const summaryLines = [
  "### Planned E2E suites",
  "",
  `- Event: \`${eventName}\``,
  `- Target: \`${target}\``,
  `- Publish HTML report to GitHub Pages: \`${publishReport}\``,
  isForkPr ? "- GitHub Pages publish is skipped for fork PRs because workflow write permissions are not available." : null,
  `- Selected suites: ${shouldRun ? suites.map((suite) => `\`${suite}\``).join(", ") : "none"}`,
].filter(Boolean);

fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summaryLines.join("\n")}\n`);
