import { describe, expect, test } from "bun:test";
import {
  buildRunLogAvailablePrompt,
  buildRunLogLatestPath,
  buildRunLogMissingPrompt,
  matchesViewRunLogsSlashQuery,
  resolveViewRunLogsPromptText,
  runLogWindowNameFromLatestPath,
} from "../run-log-context";

describe("run-log-context", () => {
  test("builds stable latest path", () => {
    expect(buildRunLogLatestPath("/tmp/proj/")).toBe(
      "/tmp/proj/.atmos/run-logs/run-main.latest.log",
    );
  });

  test("available prompt is short and path-based", () => {
    const path = "/tmp/proj/.atmos/run-logs/run-main.latest.log";
    const prompt = buildRunLogAvailablePrompt(path, { reason: "last_start" });
    expect(prompt).toContain("Atmos Run log");
    expect(prompt).toContain("`run-main`");
    expect(prompt).toContain(path);
    expect(prompt).toContain("last Run you started");
    expect(prompt.toLowerCase()).toContain("do not read the entire file");
    expect(prompt).toContain("ask which Run tab to read");
    expect(prompt.length).toBeLessThan(1400);
  });

  test("names the extra Run terminal window from the latest path", () => {
    expect(runLogWindowNameFromLatestPath("/tmp/proj/.atmos/run-logs/run-2.latest.log")).toBe(
      "run-2",
    );
    const prompt = buildRunLogAvailablePrompt("/tmp/proj/.atmos/run-logs/run-2.latest.log", {
      reason: "preferred_window",
      otherLatestPaths: ["/tmp/proj/.atmos/run-logs/run-main.latest.log"],
    });
    expect(prompt).toContain("`run-2`");
    expect(prompt).toContain("currently open");
    expect(prompt).toContain("`run-main`");
  });

  test("missing prompt guides user to Run", () => {
    const prompt = buildRunLogMissingPrompt("/tmp/x/.atmos/run-logs/run-main.latest.log");
    expect(prompt).toContain("not available");
    expect(prompt).toContain("Run tab");
    expect(prompt).toContain("name that window");
  });

  test("resolves prompt text from the latest log object", async () => {
    const prompt = await resolveViewRunLogsPromptText("/tmp/proj", async () => ({
      latestPath: "/tmp/proj/.atmos/run-logs/run-main.latest.log",
      reason: "run_main",
      otherLatestPaths: ["/tmp/proj/.atmos/run-logs/run-2.latest.log"],
    }));
    expect(prompt).toContain("default Run tab");
    expect(prompt).toContain("run-2.latest.log");
  });

  test("slash query matching", () => {
    expect(matchesViewRunLogsSlashQuery("")).toBe(true);
    expect(matchesViewRunLogsSlashQuery("run")).toBe(true);
    expect(matchesViewRunLogsSlashQuery("log")).toBe(true);
    expect(matchesViewRunLogsSlashQuery("view run")).toBe(true);
    expect(matchesViewRunLogsSlashQuery("wiki")).toBe(false);
  });
});
