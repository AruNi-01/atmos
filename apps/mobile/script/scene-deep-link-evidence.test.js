const { describe, expect, test } = require("bun:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { MARKER, judgeDelivery } = require("./scene-deep-link-evidence");

function appLine(message) {
  return `2026-10-19 21:02:40.406 Df Atmos[92113:1] [com.facebook.react.log:javascript] ${message}`;
}

function systemUrlLine() {
  return "2026-10-19 21:02:41.000 Df CoreSimulatorBridge[80:1] Opening URL (atmos://scene-lifecycle-probe) with land.atmos.mobile";
}

function logsWithMarkers(count) {
  return [systemUrlLine(), ...Array.from({ length: count }, () => appLine(MARKER))].join("\n");
}

describe("judgeDelivery", () => {
  test("accepts a cold marker and a later warm marker without an Atmos URL", () => {
    const result = judgeDelivery(logsWithMarkers(1), logsWithMarkers(2));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.cold).toBe(1);
    expect(result.total).toBe(2);
  });

  test("accepts a double cold log when the warm open adds another marker", () => {
    const result = judgeDelivery(logsWithMarkers(2), logsWithMarkers(3));
    expect(result.ok).toBe(true);
  });

  test("fails when nothing reached the unmatched route", () => {
    const result = judgeDelivery(systemUrlLine(), systemUrlLine());
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("cold open did not reach");
    expect(result.cold).toBe(0);
  });

  test("fails when the warm open does not add a marker", () => {
    const cold = logsWithMarkers(1);
    const result = judgeDelivery(cold, cold);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("warm open did not reach");
  });

  test("ignores the marker on a system process line", () => {
    const disguised = `CoreSimulatorBridge[1:1] ${MARKER}`;
    const result = judgeDelivery(disguised, `${disguised}\n${disguised}`);
    expect(result.ok).toBe(false);
    expect(result.cold).toBe(0);
  });

  test("counts a javascript os_log line that omits the Atmos pid", () => {
    const js = `21:02:40.406 [com.facebook.react.log:javascript] ${MARKER}`;
    const result = judgeDelivery(js, `${js}\n${js}`);
    expect(result.ok).toBe(true);
    expect(result.cold).toBe(1);
    expect(result.total).toBe(2);
  });

  test("does not treat a native open-url action as delivery", () => {
    const native =
      "Atmos[86881] [FrontBoard:SceneClient] Received action(s) in scene-create: UIOpenURLAction";
    const result = judgeDelivery(native, `${native}\n${native}`);
    expect(result.ok).toBe(false);
    expect(result.cold).toBe(0);
    expect(result.errors.join("\n")).toContain("cold open did not reach");
  });

  test("fails when an Atmos line contains the probe URL", () => {
    const cold = `${logsWithMarkers(1)}\n${appLine("opened atmos://scene-lifecycle-probe")}`;
    const result = judgeDelivery(cold, logsWithMarkers(2));
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Atmos process log contains the probe URL");
  });

  test("fails when an Atmos line contains the probe path", () => {
    const all = `${logsWithMarkers(2)}\n${appLine("path scene-lifecycle-probe-warm")}`;
    const result = judgeDelivery(logsWithMarkers(1), all);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Atmos process log contains the probe URL");
  });
});

describe("NotFoundRoute log", () => {
  test("logs a fixed string and does not interpolate the path", () => {
    const source = fs.readFileSync(path.join(__dirname, "../app/+not-found.tsx"), "utf8");
    expect(source).toContain('console.error("ATMOS_ROUTE unmatched")');
    expect(source).toContain('LogBox.ignoreLogs(["ATMOS_ROUTE unmatched"])');
    expect(source).toContain("[pathname]");
    const logLine = source.split("\n").find((line) => line.includes("console.error"));
    expect(logLine).toBe('    console.error("ATMOS_ROUTE unmatched");');
    expect(logLine).not.toContain("pathname");
    expect(logLine).not.toContain("atmos://");
    expect(logLine).not.toContain("`");
  });
});

describe("verify script contract", () => {
  test("judges the JS marker and still runs both simulator sections", () => {
    const script = fs.readFileSync(path.join(__dirname, "verify-ios-scene-lifecycle.sh"), "utf8");
    expect(script).toContain('scene-deep-link-evidence.js" judge');
    expect(script).toContain('console.error("ATMOS_ROUTE unmatched")');
    expect(script).not.toContain("expected two");
    expect(script).toContain('install_and_verify "$udid27" "ios27" || failed=1');
    expect(script).toContain('install_and_verify "$udid26" "ios26" || failed=1');
    const deepLinks = script.slice(
      script.indexOf("assert_deep_links()"),
      script.indexOf("build_release()"),
    );
    expect(deepLinks).toContain("return 1");
    expect(deepLinks).not.toContain("exit 1");
  });
});

describe("judge cli", () => {
  test("exits 1 when the logs show no delivery", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scene-link-"));
    const cold = path.join(dir, "cold.txt");
    const all = path.join(dir, "all.txt");
    fs.writeFileSync(cold, systemUrlLine());
    fs.writeFileSync(all, systemUrlLine());
    const result = spawnSync(
      "bun",
      [path.join(__dirname, "scene-deep-link-evidence.js"), "judge", cold, all],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("FAIL deep link: cold open did not reach");
  });
});
