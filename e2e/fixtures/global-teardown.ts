import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const pidFile = path.join(os.tmpdir(), "atmos-e2e-api.pid");

export default async function globalTeardown(): Promise<void> {
  if (!fs.existsSync(pidFile)) {
    return;
  }

  const pid = Number.parseInt(fs.readFileSync(pidFile, "utf8"), 10);
  fs.rmSync(pidFile, { force: true });

  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {}
}
