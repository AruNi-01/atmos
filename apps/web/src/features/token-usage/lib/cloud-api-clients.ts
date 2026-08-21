/**
 * Token Usage clients whose numbers are **account-level API dumps**, not
 * per-machine session files. Classification follows tokscale-core parsers
 * (`vendor/tokscale-core/src/sessions/{cursor,trae,warp}.rs`):
 *
 * - cursor — official usage CSV (`~/.config/tokscale/cursor-cache`)
 * - trae — official session usage JSON (`trae-cache/sessions`)
 * - warp — account requests/spend (`warp-cache`)
 *
 * Atmos only *fetches* Cursor today (`crates/token-usage` cursor CSV sync).
 * Trae/Warp still count if a tokscale cache is already on disk. Matching
 * daily series on two Computers must not be summed. `antigravity-cache` is
 * that machine's IDE RPC dump — still per-Computer, not in this set.
 */
export const CLOUD_API_CLIENT_IDS = new Set(["cursor", "trae", "warp"]);

export function isCloudApiClient(clientId: string): boolean {
  return CLOUD_API_CLIENT_IDS.has(clientId.trim().toLowerCase());
}

const ACCOUNT_MATCH_RATIO = 0.9;

export function clientDailySeries(
  byDay: Array<{ date: string; by_client: Array<{ client_id: string; total_tokens: number }> }>,
  clientId: string,
): Map<string, number> {
  const series = new Map<string, number>();
  const needle = clientId.trim().toLowerCase();
  for (const day of byDay) {
    let tokens = 0;
    for (const row of day.by_client) {
      if (row.client_id.trim().toLowerCase() === needle) {
        tokens += row.total_tokens;
      }
    }
    if (tokens > 0) series.set(day.date, tokens);
  }
  return series;
}

/** Same cloud account if overlapping days almost always match (shared API export). */
export function sameCloudAccountSeries(
  left: Map<string, number>,
  right: Map<string, number>,
): boolean {
  if (left.size === 0 || right.size === 0) return false;
  const overlap: string[] = [];
  for (const date of left.keys()) {
    if (right.has(date)) overlap.push(date);
  }
  if (overlap.length === 0) return false;
  let matches = 0;
  for (const date of overlap) {
    if (left.get(date) === right.get(date)) matches += 1;
  }
  return matches / overlap.length >= ACCOUNT_MATCH_RATIO;
}

export function clusterCloudAccountIndices(
  seriesList: Array<Map<string, number>>,
): number[][] {
  const n = seriesList.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]!);
    return parent[i]!;
  };
  const union = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };
  for (let i = 0; i < n; i += 1) {
    if (seriesList[i]!.size === 0) continue;
    for (let j = i + 1; j < n; j += 1) {
      if (seriesList[j]!.size === 0) continue;
      if (sameCloudAccountSeries(seriesList[i]!, seriesList[j]!)) union(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    if (seriesList[i]!.size === 0) continue;
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(i);
    groups.set(root, list);
  }
  return [...groups.values()];
}
