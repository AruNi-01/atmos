/**
 * Write structural parity trees for F1–F13.
 * Run from anywhere: bun scripts/agent-chat-parity/export-trees.ts
 * Output: <repo>/artifacts/structural/<id>.tree.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PARITY_FIXTURE_IDS,
  parityFixtureById,
  projectParityTree,
} from "../../packages/agent-transcript/src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "artifacts", "structural");
mkdirSync(outDir, { recursive: true });

for (const id of PARITY_FIXTURE_IDS) {
  const fixture = parityFixtureById(id);
  if (!fixture) {
    console.error(`missing fixture ${id}`);
    process.exit(1);
  }
  const tree = projectParityTree(fixture.messages, { cards: fixture.cards });
  writeFileSync(join(outDir, `${id}.tree.json`), `${JSON.stringify(tree, null, 2)}\n`);
}

console.log(`${PARITY_FIXTURE_IDS.length} trees written to ${outDir}`);
