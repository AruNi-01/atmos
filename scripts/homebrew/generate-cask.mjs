#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_OWNER = "AruNi-01";
const DEFAULT_REPO = "atmos";
const DEFAULT_HOMEPAGE = "https://atmos.land";
const DEFAULT_OUTPUT = "Casks/atmos.rb";

function printUsage() {
  console.error(`Usage:
  node scripts/homebrew/generate-cask.mjs [options]

Options:
  --tag <tag>           Release tag, e.g. desktop-v0.2.0
  --owner <owner>       GitHub owner (default: ${DEFAULT_OWNER})
  --repo <repo>         GitHub repo (default: ${DEFAULT_REPO})
  --token <token>       Cask token (default: atmos)
  --name <name>         App display name (default: Atmos)
  --desc <desc>         Cask description (default: Atmosphere for Agentic Builders)
  --homepage <url>      Homepage URL (default: ${DEFAULT_HOMEPAGE})
  --output <path>       Output path relative to repo root (default: ${DEFAULT_OUTPUT})
  --release-url <url>   GitHub API release URL (optional alternative to --tag)
  --help                Show this message

Examples:
  node scripts/homebrew/generate-cask.mjs --tag desktop-v0.2.0
  GITHUB_TOKEN=xxx node scripts/homebrew/generate-cask.mjs --tag desktop-v0.2.0 --output Casks/atmos.rb
`);
}

function parseArgs(argv) {
  const args = {
    owner: DEFAULT_OWNER,
    repo: DEFAULT_REPO,
    token: "atmos",
    name: "Atmos",
    desc: "Atmosphere for Agentic Builders",
    homepage: DEFAULT_HOMEPAGE,
    output: DEFAULT_OUTPUT,
    tag: "",
    releaseUrl: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    const next = argv[i + 1];
    if (!next) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch (arg) {
      case "--tag":
        args.tag = next;
        i += 1;
        break;
      case "--owner":
        args.owner = next;
        i += 1;
        break;
      case "--repo":
        args.repo = next;
        i += 1;
        break;
      case "--token":
        args.token = next;
        i += 1;
        break;
      case "--name":
        args.name = next;
        i += 1;
        break;
      case "--desc":
        args.desc = next;
        i += 1;
        break;
      case "--homepage":
        args.homepage = next;
        i += 1;
        break;
      case "--output":
        args.output = next;
        i += 1;
        break;
      case "--release-url":
        args.releaseUrl = next;
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function ensure(value, message) {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function escapeRubyString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeSha256(digest) {
  if (!digest) return "";
  const match = String(digest).match(/sha256:([a-fA-F0-9]{64})$/);
  if (match) return match[1].toLowerCase();
  if (/^[a-fA-F0-9]{64}$/.test(String(digest))) return String(digest).toLowerCase();
  return "";
}

function extractVersionFromTag(tag) {
  const match = String(tag).match(/^desktop-v(.+)$/);
  if (!match) {
    throw new Error(`Release tag "${tag}" does not match expected format "desktop-v<version>"`);
  }
  return match[1];
}

function inferDmgArch(assetName) {
  if (assetName.endsWith("_aarch64.dmg")) return "arm";
  if (assetName.endsWith("_x64.dmg")) return "intel";
  return "";
}

function extractAssetVersion(assetName) {
  const match = String(assetName).match(/^Atmos_(.+)_(?:aarch64|x64)\.dmg$/);
  return match ? match[1] : "";
}

async function fetchJson(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "atmos-homebrew-cask-generator",
  };

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}${body ? `\n${body}` : ""}`);
  }

  return response.json();
}

async function getRelease(args) {
  if (args.releaseUrl) {
    return fetchJson(args.releaseUrl);
  }

  if (args.tag) {
    const url = `https://api.github.com/repos/${args.owner}/${args.repo}/releases/tags/${encodeURIComponent(args.tag)}`;
    return fetchJson(url);
  }

  const url = `https://api.github.com/repos/${args.owner}/${args.repo}/releases/latest`;
  return fetchJson(url);
}

function buildCaskContent({
  token,
  version,
  assetVersion,
  armSha,
  intelSha,
  owner,
  repo,
  name,
  desc,
  homepage,
}) {
  return `cask "${escapeRubyString(token)}" do
  arch arm: "aarch64", intel: "x64"

  version "${escapeRubyString(version)},${escapeRubyString(assetVersion)}"
  sha256 arm:   "${armSha}",
         intel: "${intelSha}"

  url "https://github.com/${escapeRubyString(owner)}/${escapeRubyString(repo)}/releases/download/desktop-v#{version.csv.first}/Atmos_#{version.csv.second}_#{arch}.dmg",
      verified: "github.com/${escapeRubyString(owner)}/${escapeRubyString(repo)}/"
  name "${escapeRubyString(name)}"
  desc "${escapeRubyString(desc)}"
  homepage "${escapeRubyString(homepage)}"

  livecheck do
    url :url
    strategy :github_latest do |json, _regex|
      match = json["tag_name"]&.match(/^desktop-v(\\d+(?:\\.\\d+)+(?:[-.a-zA-Z0-9]+)?)$/)
      next if match.blank?

      version = match[1]
      release = GitHub.get_latest_release("${escapeRubyString(owner)}", "${escapeRubyString(repo)}")
      arm_asset = release["assets"]&.find { |asset| asset["name"]&.match?(/^Atmos_(.+)_aarch64\\.dmg$/) }
      asset_match = arm_asset && arm_asset["name"].match(/^Atmos_(.+)_aarch64\\.dmg$/)
      asset_version = asset_match && asset_match[1]
      next if asset_version.blank?

      "#{version},#{asset_version}"
    end
  end

  depends_on macos: ">= :catalina"

  app "Atmos.app"

  zap trash: [
    "~/Library/Application Support/com.atmos.desktop",
    "~/Library/Caches/com.atmos.desktop",
    "~/Library/HTTPStorages/com.atmos.desktop",
    "~/Library/Logs/com.atmos.desktop",
    "~/Library/Preferences/com.atmos.desktop.plist",
    "~/Library/Saved Application State/com.atmos.desktop.savedState",
  ]
end
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const release = await getRelease(args);
  const tag = ensure(release.tag_name, "Release payload does not contain tag_name");
  const version = extractVersionFromTag(tag);

  const dmgAssets = (release.assets || []).filter((asset) => String(asset.name || "").endsWith(".dmg"));
  const armAsset = dmgAssets.find((asset) => inferDmgArch(asset.name) === "arm");
  const intelAsset = dmgAssets.find((asset) => inferDmgArch(asset.name) === "intel");

  if (!armAsset || !intelAsset) {
    throw new Error(
      `Could not find both macOS DMG assets in release ${tag}. Expected assets ending with "_aarch64.dmg" and "_x64.dmg".`,
    );
  }

  const armSha = normalizeSha256(armAsset.digest);
  const intelSha = normalizeSha256(intelAsset.digest);

  if (!armSha || !intelSha) {
    throw new Error(
      `Release ${tag} does not expose usable sha256 digests for both DMG assets. arm="${armAsset.digest || ""}" intel="${intelAsset.digest || ""}"`,
    );
  }

  const armAssetVersion = extractAssetVersion(armAsset.name);
  const intelAssetVersion = extractAssetVersion(intelAsset.name);

  if (!armAssetVersion || !intelAssetVersion) {
    throw new Error(`Could not extract DMG version from asset names: "${armAsset.name}", "${intelAsset.name}"`);
  }

  if (armAssetVersion !== intelAssetVersion) {
    throw new Error(
      `Asset version mismatch between architectures: arm="${armAssetVersion}" intel="${intelAssetVersion}"`,
    );
  }

  const caskContent = buildCaskContent({
    token: args.token,
    version,
    assetVersion: armAssetVersion,
    armSha,
    intelSha,
    owner: args.owner,
    repo: args.repo,
    name: args.name,
    desc: args.desc,
    homepage: args.homepage,
  });

  const repoRoot = resolve(import.meta.dirname, "../..");
  const outputPath = resolve(repoRoot, args.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, caskContent, "utf8");

  console.log(`Generated Homebrew cask: ${outputPath}`);
  console.log(`Release tag: ${tag}`);
  console.log(`App version: ${version}`);
  console.log(`DMG version: ${armAssetVersion}`);
  console.log(`arm64 sha256: ${armSha}`);
  console.log(`x64 sha256: ${intelSha}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});