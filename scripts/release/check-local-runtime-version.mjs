import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "../..");
const cliCargoToml = resolve(rootDir, "apps/cli/Cargo.toml");
const installerPackageJson = resolve(rootDir, "packages/local-installer/package.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readCliVersion() {
  const content = readFileSync(cliCargoToml, "utf8");
  const match = content.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    fail(`Unable to resolve version from ${cliCargoToml}`);
  }
  return match[1];
}

function readInstallerVersion() {
  const content = JSON.parse(readFileSync(installerPackageJson, "utf8"));
  const version = content?.version;
  if (!version) {
    fail(`Unable to resolve version from ${installerPackageJson}`);
  }
  return String(version);
}

function getReleaseTagFromArgs(argv) {
  const fromEnv = process.env.RELEASE_TAG;
  if (fromEnv) return fromEnv;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--release-tag") {
      const next = argv[index + 1];
      if (!next) fail("Missing value for --release-tag");
      return next;
    }
    if (arg.startsWith("--release-tag=")) {
      return arg.slice("--release-tag=".length);
    }
  }
  return "";
}

const cliVersion = readCliVersion();
const installerVersion = readInstallerVersion();
const releaseTag = getReleaseTagFromArgs(process.argv.slice(2));

console.log(`apps/cli/Cargo.toml: ${cliVersion}`);
console.log(`packages/local-installer/package.json: ${installerVersion}`);

if (cliVersion !== installerVersion) {
  fail(`Version mismatch: cli=${cliVersion}, installer=${installerVersion}`);
}

if (releaseTag) {
  const expectedTag = `local-v${cliVersion}`;
  console.log(`release tag: ${releaseTag}`);
  if (releaseTag !== expectedTag) {
    fail(`Release tag mismatch: expected ${expectedTag}, got ${releaseTag}`);
  }
}

console.log("Local runtime versions are in sync.");
