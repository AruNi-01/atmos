/**
 * Headless router + pure handlers smoke (no Electron GUI process required).
 */
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
assert(cmds.includes("browser_bridge_open"), "browser_bridge_open");
assert(cmds.includes("list_importable_browsers"), "cookies");
assert(cmds.includes("appshot_status"), "appshot");
assert(cmds.includes("tunnel_connector_detect"), "tunnel");
assert(cmds.length >= 40, `expected full command surface, got ${cmds.length}`);

const cfg = await router.invoke("get_api_config");
assert((cfg as { port: number }).port === 30303, "port");

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
