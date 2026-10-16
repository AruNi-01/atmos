#!/usr/bin/env node
// Prints the UDID of the one iOS simulator the agent e2e should drive.
//
//   ATMOS_E2E_DEVICE=<UDID | device name>   explicit choice (name must be unique)
//   ATMOS_E2E_DEFAULT_NAME=iPhone 17 Pro    default device name
//   ATMOS_E2E_DEFAULT_RUNTIME=26.5          default iOS runtime version
//
// Several simulators are usually booted at once, and agent-device refuses to guess
// (AMBIGUOUS_MATCH). Pinning one UDID here avoids that. Read-only: never boots,
// creates or erases a simulator.
import { execFileSync } from "node:child_process";

const UDID = /^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i;
const explicit = process.env.ATMOS_E2E_DEVICE?.trim();
const defaultName = process.env.ATMOS_E2E_DEFAULT_NAME?.trim() || "iPhone 17 Pro";
const defaultRuntime = process.env.ATMOS_E2E_DEFAULT_RUNTIME?.trim() || "26.5";

const fail = (message) => {
  process.stderr.write(`resolve-device: ${message}\n`);
  process.exit(1);
};

if (explicit && UDID.test(explicit)) {
  process.stdout.write(`${explicit.toUpperCase()}\n`);
  process.exit(0);
}

let listing;
try {
  listing = JSON.parse(
    execFileSync("xcrun", ["simctl", "list", "devices", "available", "-j"], { encoding: "utf8" }),
  );
} catch (error) {
  fail(`xcrun simctl list failed (${error instanceof Error ? error.message : error})`);
}

const devices = Object.entries(listing.devices).flatMap(([runtime, list]) => {
  const version = /iOS-(\d+(?:-\d+)*)$/.exec(runtime)?.[1]?.replaceAll("-", ".");
  return version ? list.map((d) => ({ ...d, version })) : [];
});

const name = explicit || defaultName;
const matches = devices.filter(
  (d) => d.name === name && (explicit ? true : d.version === defaultRuntime),
);

if (matches.length === 1) {
  process.stdout.write(`${matches[0].udid}\n`);
} else if (matches.length === 0) {
  fail(
    `no available iOS simulator "${name}"${explicit ? "" : ` on iOS ${defaultRuntime}`}. ` +
      "Set ATMOS_E2E_DEVICE to a UDID from `xcrun simctl list devices available`.",
  );
} else {
  fail(
    `"${name}" is ambiguous (${matches.map((d) => `${d.udid} iOS ${d.version}`).join(", ")}). ` +
      "Set ATMOS_E2E_DEVICE to one UDID.",
  );
}
