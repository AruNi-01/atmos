/**
 * Main-process file logger. Renderer `write_log` only covers the web UI;
 * Appshots trigger / boot diagnostics must land on disk for packaged apps
 * (Finder-launched apps have no terminal stdout).
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

function logFilePath(): string {
  return join(
    process.env.ATMOS_HOME || join(homedir(), ".atmos"),
    "logs",
    "desktop-main.log",
  );
}

export function mainLog(message: string, level: "info" | "warn" | "error" = "info"): void {
  const line = `${new Date().toISOString()} [${level}] ${message}\n`;
  try {
    const path = logFilePath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, line, "utf8");
  } catch {
    /* ignore disk errors */
  }
  // Still mirror to console when a terminal is attached (dev).
  if (level === "error") console.error(message);
  else if (level === "warn") console.warn(message);
  else console.log(message);
}

export function mainLogPath(): string {
  return logFilePath();
}
