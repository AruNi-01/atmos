/**
 * Fail if TS WS_ACTIONS ≠ fixtures/actions.server.json (enum-backed extract).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WS_ACTIONS } from "../src/ws/actions";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const fixturePath = join(packageRoot, "fixtures/actions.server.json");

export function diffActionSets(
  tsActions: readonly string[],
  serverActions: readonly string[],
): { missingInTs: string[]; extraInTs: string[] } {
  const ts = new Set(tsActions);
  const server = new Set(serverActions);
  const missingInTs = [...server].filter((a) => !ts.has(a)).sort();
  const extraInTs = [...ts].filter((a) => !server.has(a)).sort();
  return { missingInTs, extraInTs };
}

function main() {
  const server = JSON.parse(readFileSync(fixturePath, "utf8")) as string[];
  if (!Array.isArray(server) || server.some((x) => typeof x !== "string")) {
    throw new Error("actions.server.json must be a string array");
  }
  const { missingInTs, extraInTs } = diffActionSets(WS_ACTIONS, server);
  if (missingInTs.length || extraInTs.length) {
    console.error("WsAction catalog drift:");
    if (missingInTs.length) {
      console.error("  missing in TS:", missingInTs.join(", "));
    }
    if (extraInTs.length) {
      console.error("  extra in TS:", extraInTs.join(", "));
    }
    process.exit(1);
  }
  console.log(`OK: ${WS_ACTIONS.length} actions match server fixture`);
}

if (typeof import.meta !== "undefined" && (import.meta as { main?: boolean }).main) {
  main();
}
