import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const apiSrc = readFileSync(join(import.meta.dir, "resource-monitor-api.ts"), "utf8");
const requestSrc = readFileSync(join(import.meta.dir, "request.ts"), "utf8");

describe("resourceMonitorApi.get scope", () => {
  test("get uses wsRequestForComputerScope with the captured scope", () => {
    expect(apiSrc).toContain("get: (scope: ComputerQueryScope)");
    expect(apiSrc).toContain('wsRequestForComputerScope(scope, "resource_monitor_get"');
    expect(apiSrc).not.toMatch(/wsRequest\(/);
  });

  test("scoped helper rejects when the captured scope is no longer current", () => {
    expect(requestSrc).toContain("export function wsRequestForComputerScope");
    expect(requestSrc).toContain("if (!isComputerQueryScopeCurrent(expectedScope))");
    expect(requestSrc).toContain("Computer scope changed before WebSocket request");
    expect(apiSrc).toContain("wsRequestForComputerScope(scope,");
    expect(apiSrc).toContain("resource_monitor_get");
    expect(apiSrc).toContain("resource_monitor_subscribe");
    expect(apiSrc).toContain("resource_monitor_unsubscribe");
  });
});
