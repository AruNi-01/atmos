/**
 * Extract main-app WS action wire names from Rust `pub enum WsAction`.
 * Writes fixtures/actions.server.json (serde rename_all = snake_case).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const repoRoot = join(packageRoot, "../..");
const messageRs = join(repoRoot, "apps/api/src/api/ws/message.rs");
const outPath = join(packageRoot, "fixtures/actions.server.json");

function camelToSnake(name: string): string {
  const s1 = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  const s2 = s1.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2");
  return s2.toLowerCase();
}

export function extractWsActionsFromMessageRs(source: string): string[] {
  const match = source.match(/pub enum WsAction\s*\{([\s\S]*?)\n\}/);
  if (!match) {
    throw new Error("Could not find pub enum WsAction in message.rs");
  }
  const body = match[1]!;
  const variants: string[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9_]*)/);
    if (!m) continue;
    const name = m[1]!;
    if (name[0] !== name[0]!.toUpperCase()) continue;
    variants.push(camelToSnake(name));
  }
  if (variants.length === 0) {
    throw new Error("No WsAction variants extracted");
  }
  const unique = new Set(variants);
  if (unique.size !== variants.length) {
    throw new Error("Duplicate WsAction wire names after extract");
  }
  return variants;
}

function main() {
  const source = readFileSync(messageRs, "utf8");
  const actions = extractWsActionsFromMessageRs(source);
  writeFileSync(outPath, `${JSON.stringify(actions, null, 2)}\n`);
  console.log(`Wrote ${actions.length} actions to ${outPath}`);
}

if (typeof import.meta !== "undefined" && (import.meta as { main?: boolean }).main) {
  main();
}
