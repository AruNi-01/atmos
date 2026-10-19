// Decides whether simulator logs show the probe URL reached the JS router.
// The unmatched screen logs a fixed string. The URL itself must not appear
// on an Atmos process line. CoreSimulatorBridge may still print the URL.

const MARKER = "ATMOS_ROUTE unmatched";
const URL_TOKENS = ["atmos://", "scene-lifecycle-probe"];

function isAppLine(line) {
  if (line.includes("CoreSimulatorBridge")) return false;
  // Compact `log show` lines look like `Atmos[86881] ...`. Release JS
  // `console.error` is also `os_log` on `com.facebook.react.log:javascript`,
  // and a summary line may keep only that subsystem.
  return /(?:^|\s)Atmos\[\d+/.test(line) || line.includes("com.facebook.react.log");
}

function appLines(logText) {
  return String(logText).split("\n").filter(isAppLine);
}

function markerCount(logText) {
  return appLines(logText).filter((line) => line.includes(MARKER)).length;
}

function leakedUrl(logText) {
  return appLines(logText).some((line) => URL_TOKENS.some((token) => line.includes(token)));
}

function judgeDelivery(coldLog, allLog) {
  const cold = markerCount(coldLog);
  const total = markerCount(allLog);
  const errors = [];
  if (leakedUrl(coldLog) || leakedUrl(allLog)) {
    errors.push("Atmos process log contains the probe URL");
  }
  if (cold < 1) {
    errors.push(`cold open did not reach the JS unmatched route (found ${cold})`);
  }
  if (total <= cold) {
    errors.push(`warm open did not reach the JS unmatched route (cold ${cold}, total ${total})`);
  }
  return { ok: errors.length === 0, errors, cold, total };
}

function judgeMain(coldPath, allPath) {
  const fs = require("node:fs");
  const result = judgeDelivery(fs.readFileSync(coldPath, "utf8"), fs.readFileSync(allPath, "utf8"));
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`FAIL deep link: ${error}`);
    }
    process.exit(1);
  }
  console.log(`PASS deep link: JS unmatched route cold=${result.cold} total=${result.total}`);
}

if (require.main === module) {
  const [command, coldPath, allPath] = process.argv.slice(2);
  if (command !== "judge" || !coldPath || !allPath) {
    console.error("Usage: scene-deep-link-evidence.js judge <cold-log> <all-log>");
    process.exit(2);
  }
  judgeMain(coldPath, allPath);
}

module.exports = {
  MARKER,
  isAppLine,
  judgeDelivery,
  leakedUrl,
  markerCount,
};
