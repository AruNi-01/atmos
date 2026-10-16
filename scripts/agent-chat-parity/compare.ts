/**
 * Structural parity gate. No network.
 * Run from the repo root: bun scripts/agent-chat-parity/compare.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PARITY_FIXTURE_IDS,
  projectParityTree,
  type ParityFixture,
  type ParityNode,
} from "../../packages/agent-transcript/src/index.ts";

export type ParityMismatch = {
  id: string;
  detail: string;
};

export type ParityCompareReport = {
  ok: boolean;
  checked: number;
  mismatches: ParityMismatch[];
};

const here = dirname(fileURLToPath(import.meta.url));

export function parityFixtureRoot(): string {
  return join(here, "../../packages/agent-transcript/fixtures/parity");
}

export function scrubParityText(text: string): string[] {
  const problems: string[] = [];
  if (text.includes("/Users/")) problems.push("contains /Users/");
  if (text.includes("/home/")) problems.push("contains /home/");
  if (/\bsk-[A-Za-z0-9]/.test(text)) problems.push("contains a token prefix");
  if (text.includes("ghp_")) problems.push("contains ghp_");
  if (/Bearer\s+\S/.test(text)) problems.push("contains a bearer token");
  return problems;
}

function fixtureRank(id: string): number {
  const match = /^F(\d+)$/.exec(id);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function preview(value: unknown): string {
  const text = JSON.stringify(value) ?? "undefined";
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function diffValue(expected: unknown, actual: unknown, path: string, out: string[]): void {
  if (Object.is(expected, actual)) return;
  if (out.length > 40) return;
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      out.push(`${path} expected ${preview(expected)} actual ${preview(actual)}`);
      return;
    }
    const count = Math.max(expected.length, actual.length);
    for (let index = 0; index < count; index += 1) {
      if (out.length > 40) return;
      const next = `${path}[${index}]`;
      if (index >= expected.length) out.push(`${next} unexpected ${preview(actual[index])}`);
      else if (index >= actual.length) out.push(`${next} missing ${preview(expected[index])}`);
      else diffValue(expected[index], actual[index], next, out);
    }
    return;
  }
  if (isRecord(expected) && isRecord(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      if (out.length > 40) return;
      const next = `${path}.${key}`;
      if (!Object.prototype.hasOwnProperty.call(expected, key)) {
        out.push(`${next} unexpected ${preview(actual[key])}`);
      } else if (!Object.prototype.hasOwnProperty.call(actual, key)) {
        out.push(`${next} missing ${preview(expected[key])}`);
      } else {
        diffValue(expected[key], actual[key], next, out);
      }
    }
    return;
  }
  out.push(`${path} expected ${preview(expected)} actual ${preview(actual)}`);
}

function parseFixture(raw: string, id: string): ParityFixture | string {
  const scrub = scrubParityText(raw);
  if (scrub.length > 0) return scrub.join("; ");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return error instanceof Error ? error.message : "invalid json";
  }
  if (!isRecord(value)) return "fixture is not an object";
  if (value.id !== id) return `id is ${String(value.id)}`;
  if (!Array.isArray(value.messages)) return "messages is not an array";
  return value as ParityFixture;
}

export function compareFixtures(root = parityFixtureRoot()): ParityCompareReport {
  const onDisk = new Set(
    readdirSync(root)
      .filter((name) => /^F\d+\.json$/.test(name))
      .map((name) => name.slice(0, -".json".length)),
  );
  const ids = [
    ...PARITY_FIXTURE_IDS,
    ...[...onDisk].filter(
      (id) => !PARITY_FIXTURE_IDS.includes(id as (typeof PARITY_FIXTURE_IDS)[number]),
    ),
  ];
  ids.sort((left, right) => fixtureRank(left) - fixtureRank(right) || left.localeCompare(right));
  const mismatches: ParityMismatch[] = [];
  for (const id of ids) {
    if (!onDisk.has(id)) {
      mismatches.push({ id, detail: "missing fixture file" });
      continue;
    }
    const raw = readFileSync(join(root, `${id}.json`), "utf8");
    const fixture = parseFixture(raw, id);
    if (typeof fixture === "string") {
      mismatches.push({ id, detail: fixture });
      continue;
    }
    const actual = projectParityTree(fixture.messages, { cards: fixture.cards });
    const expectedPath = join(root, "expected", `${id}.tree.json`);
    let expected: unknown;
    try {
      expected = JSON.parse(readFileSync(expectedPath, "utf8")) as ParityNode[];
    } catch {
      mismatches.push({ id, detail: `missing expected tree expected/${id}.tree.json` });
      continue;
    }
    const lines: string[] = [];
    diffValue(expected, actual, "$", lines);
    if (lines.length > 0) mismatches.push({ id, detail: lines.join("\n") });
  }
  return { ok: mismatches.length === 0, checked: ids.length, mismatches };
}

if (import.meta.main) {
  const report = compareFixtures();
  if (!report.ok) {
    for (const mismatch of report.mismatches) {
      console.error(`${mismatch.id}\n${mismatch.detail}`);
    }
    process.exit(1);
  }
  console.log(`${report.checked} fixtures match`);
}
