/**
 * Headless ensure Server + get_api_config via real handlers.
 */
import { existsSync } from "node:fs";
import {
  apiBinaryPath,
  defaultRuntimeDir,
  ensureAtmosServer,
  isHealthy,
} from "../src/runtime/ensure.ts";
import { createAppState } from "../src/app-state.ts";
import { createAllHandlers } from "../src/ipc/handlers.ts";
import { createDesktopCommandRouter } from "../src/ipc/router.ts";
import { TunnelService } from "../src/tunnel/service.ts";

const runtimeDir = defaultRuntimeDir();
const apiBin = apiBinaryPath(runtimeDir);
console.log(`[smoke-boot] runtimeDir=${runtimeDir}`);
console.log(`[smoke-boot] apiBin=${apiBin} exists=${existsSync(apiBin)}`);

if (!existsSync(apiBin)) {
  console.error("[smoke-boot] missing Atmos Server — run prepare-sidecar");
  process.exit(2);
}

const runtime = await ensureAtmosServer({ healthAttempts: 40 });
console.log(
  `[smoke-boot] ensure host=${runtime.host} port=${runtime.port} started=${runtime.started}`,
);

const healthy = await isHealthy(runtime.host, runtime.port);
if (!healthy) throw new Error("healthz failed");

const state = createAppState();
state.apiHost = runtime.host;
state.apiPort = runtime.port;
state.tunnel = new TunnelService();
const router = createDesktopCommandRouter(createAllHandlers(state));

const cfg = (await router.invoke("get_api_config")) as {
  host: string;
  port: number;
};
if (cfg.port !== runtime.port) throw new Error("get_api_config mismatch");

const unsup = await router.invokeSafe("nope");
if (unsup.ok || unsup.error.code !== "DESKTOP_CMD_UNSUPPORTED") {
  throw new Error("unsupported failed");
}

const res = await fetch(`http://${runtime.host}:${runtime.port}/healthz`);
if (!res.ok) throw new Error("fetch healthz");

console.log("smoke-boot: OK");
