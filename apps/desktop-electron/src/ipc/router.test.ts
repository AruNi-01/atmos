import { describe, expect, it } from "bun:test";
import { createDesktopCommandRouter } from "./router.ts";
import { DESKTOP_CMD_UNSUPPORTED } from "../errors.ts";

describe("desktop electron command router", () => {
  it("invokes registered commands", async () => {
    const router = createDesktopCommandRouter({
      get_api_config: async () => ({ host: "127.0.0.1", port: 30303 }),
      write_log: async () => null,
    });
    expect(router.listCommands()).toEqual(["get_api_config", "write_log"]);
    const cfg = await router.invoke("get_api_config");
    expect(cfg).toEqual({ host: "127.0.0.1", port: 30303 });
  });

  it("returns DESKTOP_CMD_UNSUPPORTED for unknown commands", async () => {
    const router = createDesktopCommandRouter({
      get_api_config: async () => ({ host: "127.0.0.1", port: 1 }),
    });
    const result = await router.invokeSafe("not_a_real_command", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(DESKTOP_CMD_UNSUPPORTED);
    }
  });
});
