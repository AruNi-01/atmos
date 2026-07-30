import { describe, expect, test } from "bun:test";

import {
  composeAccessibleName,
  composeRoleHeader,
  roleGlyph,
  roleLabel,
} from "./role-chrome";

describe("orchestrator role chrome (M18b)", () => {
  test("same agent brand differs by role", () => {
    const maker = composeRoleHeader({
      role: "maker",
      agentDisplay: "Codex",
      instance: "iter 1",
    });
    const verify = composeRoleHeader({
      role: "verify",
      agentDisplay: "Codex",
    });
    expect(maker).not.toBe(verify);
    expect(maker).toContain("Maker");
    expect(verify).toContain("Verify");
    expect(maker).toContain("Codex");
    expect(verify).toContain("Codex");
  });

  test("multi-maker instance labels required in composition", () => {
    const a = composeRoleHeader({
      role: "maker",
      agentDisplay: "Codex",
      instance: "unit-api",
    });
    const b = composeRoleHeader({
      role: "maker",
      agentDisplay: "Codex",
      instance: "unit-ui",
    });
    expect(a).not.toBe(b);
    expect(a).toContain("unit-api");
    expect(b).toContain("unit-ui");
  });

  test("activity appears when not active", () => {
    const h = composeRoleHeader({
      role: "criteria",
      agentDisplay: "Claude Code",
      activity: "waiting_user",
    });
    expect(h).toContain("waiting_user");
  });

  test("accessible name includes glyph and role", () => {
    const name = composeAccessibleName({
      role: "orchestrator",
      agentDisplay: "Codex",
      activity: "active",
    });
    expect(name).toContain(roleGlyph("orchestrator"));
    expect(name).toContain(roleLabel("orchestrator"));
  });
});
