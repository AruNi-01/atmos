import { describe, expect, test } from "bun:test";
import {
  buildRunLogAvailablePrompt,
  buildRunLogLatestPath,
  buildRunLogMissingPrompt,
  matchesViewRunLogsSlashQuery,
} from "../run-log-context";

describe("run-log-context", () => {
  test("builds stable latest path", () => {
    expect(buildRunLogLatestPath("/tmp/proj/")).toBe(
      "/tmp/proj/.atmos/run-logs/run-main.latest.log",
    );
  });

  test("available prompt is short and path-based", () => {
    const path = "/tmp/proj/.atmos/run-logs/run-main.latest.log";
    const prompt = buildRunLogAvailablePrompt(path);
    expect(prompt).toContain("Atmos Run log");
    expect(prompt).toContain(path);
    expect(prompt.toLowerCase()).toContain("do not read the entire file");
    expect(prompt.length).toBeLessThan(800);
  });

  test("missing prompt guides user to Run", () => {
    const prompt = buildRunLogMissingPrompt("/tmp/x/.atmos/run-logs/run-main.latest.log");
    expect(prompt).toContain("not available");
    expect(prompt).toContain("Run tab");
  });

  test("slash query matching", () => {
    expect(matchesViewRunLogsSlashQuery("")).toBe(true);
    expect(matchesViewRunLogsSlashQuery("run")).toBe(true);
    expect(matchesViewRunLogsSlashQuery("log")).toBe(true);
    expect(matchesViewRunLogsSlashQuery("view run")).toBe(true);
    expect(matchesViewRunLogsSlashQuery("wiki")).toBe(false);
  });
});
