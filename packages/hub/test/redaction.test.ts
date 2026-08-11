import { describe, expect, test } from "bun:test";
import { redactSnapshot } from "../src/redaction";

describe("redactSnapshot", () => {
  test("strips denied keys", () => {
    const out = redactSnapshot(
      {
        summary: { total_tokens: 10 },
        prompt: "secret chat",
        cwd: "/Users/me/secret",
        path: "/tmp/x",
      },
      { includeCost: false },
    );
    expect(out.prompt).toBeUndefined();
    expect(out.cwd).toBeUndefined();
    expect(out.path).toBeUndefined();
    expect((out.summary as { total_tokens: number }).total_tokens).toBe(10);
  });

  test("strips cost unless includeCost", () => {
    const without = redactSnapshot(
      { total_cost_usd: 12.5, total_tokens: 100 },
      { includeCost: false },
    );
    expect(without.total_cost_usd).toBeUndefined();
    expect(without.total_tokens).toBe(100);

    const withCost = redactSnapshot(
      { total_cost_usd: 12.5, total_tokens: 100 },
      { includeCost: true },
    );
    expect(withCost.total_cost_usd).toBe(12.5);
  });
});
