/**
 * Extract main-app WS event wire names from Rust `pub enum WsEvent`.
 * Writes fixtures/events.server.json (serde rename_all = snake_case).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractWsEventsFromMessageRs } from "./extract-ws-actions";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const repoRoot = join(packageRoot, "../..");
const messageRs = join(repoRoot, "apps/api/src/api/ws/message.rs");
const outPath = join(packageRoot, "fixtures/events.server.json");

function main() {
  const source = readFileSync(messageRs, "utf8");
  const events = extractWsEventsFromMessageRs(source);
  writeFileSync(outPath, `${JSON.stringify(events, null, 2)}\n`);
  console.log(`Wrote ${events.length} events to ${outPath}`);
}

if (typeof import.meta !== "undefined" && (import.meta as { main?: boolean }).main) {
  main();
}
