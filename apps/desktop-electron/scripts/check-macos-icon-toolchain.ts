/**
 * CI/local preflight: Xcode actool ≥ 26 and Icon Composer package present.
 * Exit 0 on success; non-zero with a clear message otherwise.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkActool26,
  hasIconComposerPackage,
  ICON_COMPOSER_REL,
} from "./macos-icon.ts";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const actool = checkActool26();
if (!actool.ok) {
  console.error(`[check-macos-icon] ${actool.reason}`);
  process.exit(1);
}
console.log(`[check-macos-icon] actool ${actool.version}`);

if (!hasIconComposerPackage(appRoot)) {
  console.error(`[check-macos-icon] missing ${ICON_COMPOSER_REL}`);
  process.exit(1);
}
console.log(`[check-macos-icon] ${ICON_COMPOSER_REL} OK`);
