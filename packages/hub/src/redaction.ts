/**
 * Usage share snapshot redaction (APP-056 M8/M9).
 * Pure function — unit tested without network.
 */

const DENY_KEYS = new Set([
  "prompt",
  "prompts",
  "path",
  "paths",
  "cwd",
  "messages",
  "content",
  "transcript",
  "raw",
  "file",
  "files",
  "repo",
  "repository",
  "project_path",
  "project_name",
  "credential",
  "token",
  "secret",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stripDenied(value: unknown, depth = 0): unknown {
  if (depth > 12) return null;
  if (Array.isArray(value)) {
    return value.map((item) => stripDenied(item, depth + 1));
  }
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const key = k.toLowerCase();
    if (DENY_KEYS.has(key) || key.includes("password") || key.includes("secret")) {
      continue;
    }
    out[k] = stripDenied(v, depth + 1);
  }
  return out;
}

export type RedactOptions = {
  includeCost: boolean;
};

/**
 * Build a safe public snapshot from client-supplied overview JSON.
 * Drops denylisted keys; strips cost fields unless includeCost.
 */
export function redactSnapshot(
  input: unknown,
  opts: RedactOptions,
): Record<string, unknown> {
  const cleaned = stripDenied(input);
  const base = isPlainObject(cleaned) ? cleaned : { raw: cleaned };

  if (!opts.includeCost) {
    return stripCostFields(base) as Record<string, unknown>;
  }

  return {
    ...base,
    schema_version: 1,
    generated_at: Date.now(),
  };
}

function stripCostFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripCostFields);
  }
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const key = k.toLowerCase();
    if (
      key.includes("cost") ||
      key === "total_cost_usd" ||
      key === "estimated_cost"
    ) {
      continue;
    }
    out[k] = stripCostFields(v);
  }
  return out;
}
