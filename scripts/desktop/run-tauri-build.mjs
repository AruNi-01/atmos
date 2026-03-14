import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const cwd = resolve(import.meta.dirname, "../../apps/desktop");

const result = spawnSync("bun", ["x", "tauri", "build"], {
  cwd,
  stdio: "inherit",
  env: {
    ...process.env,
    ATMOS_LOG_LEVEL: process.env.ATMOS_LOG_LEVEL ?? "info",
  },
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
