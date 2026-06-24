import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "../..");
const localRuntimeVersionJson = resolve(rootDir, "resources/local-runtime/version.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readLocalRuntimeVersion() {
  const content = JSON.parse(readFileSync(localRuntimeVersionJson, "utf8"));
  const version = content?.version;
  if (!version) {
    fail(`Unable to resolve version from ${localRuntimeVersionJson}`);
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

const runtimeVersion = readLocalRuntimeVersion();
const releaseTag = getReleaseTagFromArgs(process.argv.slice(2));

console.log(`resources/local-runtime/version.json: ${runtimeVersion}`);

if (releaseTag) {
  const expectedTag = `local-web-runtime-v${runtimeVersion}`;
  console.log(`release tag: ${releaseTag}`);
  if (releaseTag !== expectedTag) {
    fail(`Release tag mismatch: expected ${expectedTag}, got ${releaseTag}`);
  }
}

console.log("Local runtime release version is valid.");
