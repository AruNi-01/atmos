import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planOpenInSimulator } from "./open-project.ts";

describe("planOpenInSimulator", () => {
  it("detects Expo worktrees", () => {
    const root = mkdtempSync(join(tmpdir(), "sim-expo-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ dependencies: { expo: "54.0.0" } }),
      );
      const plan = planOpenInSimulator(root);
      expect(plan.ok).toBe(true);
      if (plan.ok) expect(plan.metroCommand).toContain("expo start");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a worktree that is not Expo or React Native", () => {
    const root = mkdtempSync(join(tmpdir(), "sim-other-"));
    try {
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "lib" }));
      const plan = planOpenInSimulator(root);
      expect(plan.ok).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
