import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(fixturesDir, "../..");
const apiPort = Number.parseInt(process.env.E2E_API_PORT ?? "30303", 10);
const pidFile = path.join(os.tmpdir(), "atmos-e2e-api.pid");

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for API port ${port}`);
}

export default async function globalSetup(): Promise<void> {
  if (await isPortOpen(apiPort)) {
    return;
  }

  const child = spawn("bash", ["-lc", "just dev-api"], {
    cwd: repoRoot,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  fs.writeFileSync(pidFile, String(child.pid), "utf8");

  await waitForPort(apiPort, 120_000);
}
