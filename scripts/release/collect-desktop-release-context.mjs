#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dirname, "../..");
const DESKTOP_TAG_PREFIX = "desktop-v";

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function sh(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    env: process.env,
    ...options,
  });

  if (result.error) {
    fail(`Failed to run ${command}: ${result.error.message}`);
  }

  if ((result.status ?? 0) !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    fail(`${command} ${args.join(" ")} failed: ${detail || `exit code ${result.status}`}`);
  }

  return (result.stdout || "").trim();
}

function parseArgs(argv) {
  const args = {
    currentTag: process.env.RELEASE_TAG || "",
    previousTag: "",
    toRef: "",
    output: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--current-tag") {
      if (!next) fail("Missing value for --current-tag");
      args.currentTag = next;
      i += 1;
      continue;
    }

    if (arg === "--previous-tag") {
      if (!next) fail("Missing value for --previous-tag");
      args.previousTag = next;
      i += 1;
      continue;
    }

    if (arg === "--to-ref") {
      if (!next) fail("Missing value for --to-ref");
      args.toRef = next;
      i += 1;
      continue;
    }

    if (arg === "--output") {
      if (!next) fail("Missing value for --output");
      args.output = next;
      i += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(`Collect Atmos desktop release context

Usage:
  node ./scripts/release/collect-desktop-release-context.mjs --current-tag desktop-v0.2.6
  node ./scripts/release/collect-desktop-release-context.mjs --current-tag desktop-v0.2.6 --to-ref HEAD --output /tmp/release-context.json

Options:
  --current-tag <tag>   Current desktop release tag, defaults to RELEASE_TAG
  --previous-tag <tag>  Override the previous desktop release tag
  --to-ref <ref>        Git ref to inspect, defaults to <current-tag>
  --output <path>       Write JSON output to a file instead of stdout
`);
      process.exit(0);
    }

    fail(`Unknown argument: ${arg}`);
  }

  if (!args.currentTag) {
    fail("Missing current desktop tag. Pass --current-tag or set RELEASE_TAG.");
  }

  if (!args.currentTag.startsWith(DESKTOP_TAG_PREFIX)) {
    fail(
      `Invalid current tag "${args.currentTag}". Expected format ${DESKTOP_TAG_PREFIX}<version>.`,
    );
  }

  args.toRef = args.toRef || args.currentTag;
  return args;
}

function getDesktopTags() {
  return sh("git", [
    "for-each-ref",
    "--sort=-creatordate",
    "--format=%(refname:strip=2)",
    "refs/tags/desktop-v*",
  ])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function resolvePreviousTag(currentTag, explicitPreviousTag) {
  if (explicitPreviousTag) {
    return explicitPreviousTag;
  }

  return getDesktopTags().find((tag) => tag !== currentTag) || "";
}

function getCommitEntries(fromRef, toRef) {
  const range = fromRef ? `${fromRef}..${toRef}` : toRef;
  const raw = sh("git", ["log", "--no-merges", "--format=%H%x09%s", range]);

  if (!raw) {
    return [];
  }

  return raw
    .split("\n")
    .map((line) => {
      const [hash, ...subjectParts] = line.split("\t");
      return {
        hash: hash.trim(),
        shortHash: hash.trim().slice(0, 8),
        subject: subjectParts.join("\t").trim(),
      };
    })
    .filter((entry) => entry.hash && entry.subject)
    .filter((entry) => !/^chore\(desktop\): release /i.test(entry.subject));
}

function getGitHubRepoSlug() {
  const fromEnv = (process.env.GITHUB_REPOSITORY || "").trim();
  if (fromEnv) {
    return fromEnv;
  }

  const remote = sh("git", ["remote", "get-url", "origin"]);
  const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);

  if (!match) {
    fail("Could not determine GitHub repository from origin remote.");
  }

  return `${match[1]}/${match[2]}`;
}

function uniqBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ghJson(args) {
  return JSON.parse(sh("gh", args));
}

function getAssociatedPullRequests(owner, repo, commitHash) {
  const response = ghJson([
    "api",
    "-H",
    "Accept: application/vnd.github+json",
    `repos/${owner}/${repo}/commits/${commitHash}/pulls`,
  ]);

  return Array.isArray(response)
    ? response.map((pr) => ({
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
      }))
    : [];
}

function getPullRequestDetails(owner, repo, number) {
  const query = `
    query ReleasePullRequestDetails($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          number
          title
          url
          mergedAt
          closingIssuesReferences(first: 20) {
            nodes {
              number
              title
              url
              state
            }
          }
        }
      }
    }
  `;

  const response = ghJson([
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-F",
    `owner=${owner}`,
    "-F",
    `repo=${repo}`,
    "-F",
    `number=${number}`,
  ]);

  const pr = response?.data?.repository?.pullRequest;
  if (!pr?.mergedAt) {
    return null;
  }

  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    closingIssues: (pr.closingIssuesReferences?.nodes || [])
      .filter((issue) => issue?.number)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        url: issue.url,
        state: issue.state,
      })),
  };
}

function collectReleaseContext({ currentTag, previousTag, toRef }) {
  const repoSlug = getGitHubRepoSlug();
  const [owner, repo] = repoSlug.split("/");
  const commits = getCommitEntries(previousTag, toRef);
  const prDetailsCache = new Map();

  const enrichedCommits = commits.map((commit) => {
    const associatedPullRequests = getAssociatedPullRequests(owner, repo, commit.hash);
    const mergedPullRequests = associatedPullRequests
      .map((pr) => {
        if (!prDetailsCache.has(pr.number)) {
          prDetailsCache.set(pr.number, getPullRequestDetails(owner, repo, pr.number));
        }
        return prDetailsCache.get(pr.number);
      })
      .filter(Boolean);

    const closingIssues = uniqBy(
      mergedPullRequests.flatMap((pr) => pr.closingIssues || []),
      (issue) => issue.number,
    );

    return {
      ...commit,
      mergedPullRequests: mergedPullRequests.map((pr) => ({
        number: pr.number,
        title: pr.title,
        url: pr.url,
      })),
      closingIssues,
    };
  });

  const mergedPullRequests = uniqBy(
    enrichedCommits.flatMap((commit) => commit.mergedPullRequests),
    (pr) => pr.number,
  );

  const closedIssues = uniqBy(
    enrichedCommits.flatMap((commit) => commit.closingIssues),
    (issue) => issue.number,
  );

  return {
    repository: repoSlug,
    currentTag,
    previousTag,
    toRef,
    version: currentTag.replace(DESKTOP_TAG_PREFIX, ""),
    commitRange: previousTag ? `${previousTag}..${toRef}` : toRef,
    commits: enrichedCommits,
    mergedPullRequests,
    closedIssues,
  };
}

function writeOutput(path, content) {
  const outputPath = resolve(repoRoot, path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content, "utf8");
  return outputPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const previousTag = resolvePreviousTag(args.currentTag, args.previousTag);
  const context = collectReleaseContext({
    currentTag: args.currentTag,
    previousTag,
    toRef: args.toRef,
  });

  const json = JSON.stringify(context, null, 2);

  if (args.output) {
    console.log(writeOutput(args.output, json));
    return;
  }

  process.stdout.write(`${json}\n`);
}

main();
