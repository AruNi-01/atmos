/**
 * Fail if TS WS_EVENTS ≠ fixtures/events.server.json (enum-backed extract).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WS_EVENTS } from "../src/ws/events";
import { diffActionSets } from "./check-ws-actions";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const fixturePath = join(packageRoot, "fixtures/events.server.json");

function main() {
  const server = JSON.parse(readFileSync(fixturePath, "utf8")) as string[];
  if (!Array.isArray(server) || server.some((x) => typeof x !== "string")) {
    throw new Error("events.server.json must be a string array");
  }
  const { missingInTs, extraInTs } = diffActionSets(WS_EVENTS, server);
  if (missingInTs.length || extraInTs.length) {
    console.error("WsEvent catalog drift:");
    if (missingInTs.length) {
      console.error("  missing in TS:", missingInTs.join(", "));
    }
    if (extraInTs.length) {
      console.error("  extra in TS:", extraInTs.join(", "));
    }
    process.exit(1);
  }
  console.log(`OK: ${WS_EVENTS.length} events match server fixture`);
}

if (typeof import.meta !== "undefined" && (import.meta as { main?: boolean }).main) {
  main();
}
