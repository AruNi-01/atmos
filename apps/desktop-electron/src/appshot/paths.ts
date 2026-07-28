/**
 * AppShot on-disk layout — must match
 * apps/desktop/src-tauri/src/appshot/records.rs
 *
 *   ~/.atmos/appshots/records/<13-digit-ts>/
 *     snapshot.png
 *     context.md
 *     metadata.json
 */

import { homedir } from "node:os";
import { join } from "node:path";

export const APPSHOTS_DIR = ".atmos/appshots";
export const RECORDS_DIR_NAME = "records";
export const TMP_DIR_NAME = "tmp";
export const SNAPSHOT_FILE = "snapshot.png";
export const CONTEXT_FILE = "context.md";
export const METADATA_FILE = "metadata.json";

/** Override root for unit tests (absolute path that already includes appshots). */
let testAppshotsRoot: string | null = null;

export function setTestAppshotsRoot(root: string | null): void {
  testAppshotsRoot = root;
}

export function appshotsRoot(home: string = homedir()): string {
  if (testAppshotsRoot) return testAppshotsRoot;
  return join(home, ".atmos", "appshots");
}

export function recordsRoot(home?: string): string {
  return join(appshotsRoot(home), RECORDS_DIR_NAME);
}

export function tmpRoot(home?: string): string {
  return join(appshotsRoot(home), TMP_DIR_NAME);
}

export function recordDir(timestamp: string, home?: string): string {
  return join(recordsRoot(home), timestamp);
}
