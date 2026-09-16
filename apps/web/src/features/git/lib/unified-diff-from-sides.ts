function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Unified-diff hunk body (no `--- a/` header) for Pierre `processFile`. */
export function unifiedHunkBody(oldText: string, newText: string): string {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  if (a.length === 0 && b.length === 0) return "";

  const ops = diffLines(a, b);
  const oldCount = Math.max(a.length, 1);
  const newCount = Math.max(b.length, 1);
  const lines = [`@@ -1,${oldCount} +1,${newCount} @@`];
  for (const op of ops) {
    if (op.type === "eq") lines.push(` ${op.line}`);
    else if (op.type === "del") lines.push(`-${op.line}`);
    else lines.push(`+${op.line}`);
  }
  return lines.join("\n");
}

type LineOp = { type: "eq" | "del" | "add"; line: string };

function diffLines(a: string[], b: string[]): LineOp[] {
  if (a.length * b.length > 400_000) {
    return [
      ...a.map((line) => ({ type: "del" as const, line })),
      ...b.map((line) => ({ type: "add" as const, line })),
    ];
  }
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const ops: LineOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ type: "eq", line: a[i - 1] });
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ type: "del", line: a[i - 1] });
      i -= 1;
    } else {
      ops.push({ type: "add", line: b[j - 1] });
      j -= 1;
    }
  }
  while (i > 0) {
    ops.push({ type: "del", line: a[i - 1] });
    i -= 1;
  }
  while (j > 0) {
    ops.push({ type: "add", line: b[j - 1] });
    j -= 1;
  }
  ops.reverse();
  return ops;
}
