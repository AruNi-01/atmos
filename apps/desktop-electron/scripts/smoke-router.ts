/**
 * Headless router + pure handlers smoke (no Electron GUI process required).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAppState } from "../src/app-state.ts";
import { createAllHandlers } from "../src/ipc/handlers.ts";
import { createDesktopCommandRouter } from "../src/ipc/router.ts";
import { DESKTOP_CMD_UNSUPPORTED } from "../src/errors.ts";
import { TunnelService } from "../src/tunnel/service.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const state = createAppState();
state.apiPort = 30303;
state.apiHost = "127.0.0.1";
state.browser = null;
state.tunnel = new TunnelService();

const router = createDesktopCommandRouter(createAllHandlers(state));
const cmds = router.listCommands();
assert(cmds.includes("get_api_config"), "get_api_config");
assert(cmds.includes("get_desktop_shell_metrics"), "get_desktop_shell_metrics");
assert(cmds.includes("browser_bridge_open"), "browser_bridge_open");
assert(cmds.includes("browser_bridge_exit_pick_mode"), "browser_bridge_exit_pick_mode");
assert(cmds.includes("list_importable_browsers"), "cookies");
assert(cmds.includes("appshot_status"), "appshot");
assert(cmds.includes("tunnel_connector_detect"), "tunnel");
assert(cmds.length >= 40, `expected full command surface, got ${cmds.length}`);

// Guest inject source must exist after build (or be resolvable from monorepo in dev).
const electronRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distRuntime = join(electronRoot, "dist/browser-runtime.js");
const monorepoRuntime = join(
  electronRoot,
  "../../packages/shared/browser/browser-runtime.js",
);
assert(
  existsSync(distRuntime) || existsSync(monorepoRuntime),
  "browser-runtime.js missing (dist or packages/shared)",
);

const cfg = await router.invoke("get_api_config");
assert((cfg as { port: number }).port === 30303, "port");

const shell = await router.invoke("get_desktop_shell_metrics");
assert(
  (shell as { supported: boolean }).supported === false,
  "shell metrics unsupported without Electron ready",
);
assert(
  typeof (shell as { collected_at_ms: number }).collected_at_ms === "number",
  "shell collected_at_ms",
);
assert(
  typeof (shell as { logical_cpu_count: number }).logical_cpu_count === "number",
  "shell logical_cpu_count",
);
assert(
  Array.isArray((shell as { groups: unknown[] }).groups),
  "shell groups",
);
assert(
  !("pid" in (shell as object)),
  "shell snapshot must not expose pid",
);

const unsup = await router.invokeSafe("totally_unknown_cmd");
assert(unsup.ok === false, "unsupported ok");
assert(
  !unsup.ok && unsup.error.code === DESKTOP_CMD_UNSUPPORTED,
  "unsupported code",
);

const detect = await router.invoke("tunnel_connector_detect");
assert(
  Array.isArray((detect as { providers: unknown[] }).providers),
  "tunnel detect",
);

// appshot_status — web contract uses `supported` (not available)
const status = await router.invoke("appshot_status");
assert(
  typeof (status as { supported: boolean }).supported === "boolean",
  "appshot status.supported",
);
assert(
  typeof (status as { platform: string }).platform === "string",
  "appshot status.platform",
);
assert(
  (status as { trigger?: unknown }).trigger != null,
  "appshot status.trigger",
);

console.log(`smoke-router: OK (${cmds.length} commands)`);
