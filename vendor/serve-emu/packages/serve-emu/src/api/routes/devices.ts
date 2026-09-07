import type { ApiDependencies } from "../dependencies.ts";
import type { ContractApiRoute } from "./types.ts";
import { readJsonBody } from "../body.ts";
import { isEmulatorSerial } from "../../device-capabilities.ts";
import {
  parseFontScale,
  parseStreamModeRequest,
} from "../../shared/api-contracts.ts";
import { parseStreamEncoderSettingsPatch } from "../../stream-settings.ts";
import {
  downstream,
  invalid,
  parseInput,
  readObject,
  requiredString,
} from "./route-helpers.ts";

export function deviceRoutes(): ContractApiRoute<ApiDependencies>[] {
  return [
    {
      method: "GET",
      path: "/api",
      handler: ({ deps }) => Response.json(deps.getInfo()),
    },
    {
      method: "GET",
      path: "/api/stream-mode",
      handler: ({ deps }) => Response.json(deps.getStreamMode()),
    },
    {
      method: "PUT",
      path: "/api/stream-mode",
      handler: async ({ request, deps }) => {
        const payload = await readJsonBody(request);
        const streamMode = parseInput(() => parseStreamModeRequest(payload));
        return Response.json(
          await downstream("switch stream mode", () =>
            deps.setStreamMode(streamMode)
          ),
        );
      },
    },
    {
      method: "GET",
      path: "/api/stream-settings",
      handler: ({ deps }) => Response.json(deps.getStreamEncoderSettings()),
    },
    {
      method: "PATCH",
      path: "/api/stream-settings",
      handler: async ({ request, deps }) => {
        const body = await readObject(request, "stream settings payload");
        const patch = parseInput(() =>
          parseStreamEncoderSettingsPatch(body)
        );
        return Response.json(
          await downstream("update stream settings", () =>
            deps.setStreamEncoderSettings(patch)
          ),
        );
      },
    },
    {
      method: "GET",
      path: "/api/devices",
      handler: async ({ deps }) =>
        Response.json(await downstream("list devices", deps.listDevices)),
    },
    {
      method: "GET",
      path: "/api/device-grid",
      handler: async ({ deps }) =>
        Response.json(await downstream("build device grid", deps.getDeviceGrid)),
    },
    {
      method: "POST",
      path: "/api/devices/select",
      handler: async ({ request, deps }) => {
        const body = await readObject(request, "select payload");
        const serial = requiredString(body.serial, "serial");
        return Response.json(
          await downstream("select device", () => deps.selectDevice(serial)),
        );
      },
    },
    {
      method: "POST",
      path: "/api/avds/start",
      handler: async ({ request, deps }) => {
        const body = await readObject(request, "start payload");
        const avd = requiredString(body.avd, "avd");
        return Response.json(
          await downstream("start emulator", () =>
            deps.startAvd(avd, body.select !== false)
          ),
        );
      },
    },
    {
      method: "POST",
      path: "/api/avds/stop",
      handler: async ({ request, deps }) => {
        const body = await readObject(request, "stop payload");
        const serial = typeof body.serial === "string" && body.serial.trim()
          ? body.serial.trim()
          : undefined;
        const avd = typeof body.avd === "string" && body.avd.trim()
          ? body.avd.trim()
          : undefined;
        if (!serial && !avd) invalid("serial or running avd is required");
        if (serial && !isEmulatorSerial(serial)) {
          invalid(`${serial} is not an emulator`);
        }
        return Response.json(
          await downstream("stop emulator", () => deps.stopAvd({ serial, avd })),
        );
      },
    },
    {
      method: "GET",
      path: "/api/orientation",
      handler: async ({ deps }) => Response.json({
        ok: true,
        orientation: await downstream("read orientation", deps.getOrientation),
      }),
    },
    {
      method: "POST",
      path: "/api/orientation",
      handler: async ({ request, deps }) => {
        const body = await readObject(request, "orientation payload");
        const orientation = body.orientation;
        if (
          orientation !== "auto" &&
          orientation !== "portrait" &&
          orientation !== "landscape"
        ) {
          invalid("orientation must be auto, portrait, or landscape");
        }
        return Response.json({
          ok: true,
          orientation: await downstream("set orientation", () =>
            deps.setOrientation(orientation)
          ),
        });
      },
    },
    {
      method: "GET",
      path: "/api/night-mode",
      handler: async ({ deps }) => Response.json({
        ok: true,
        nightMode: await downstream("read night mode", deps.getNightMode),
      }),
    },
    {
      method: "POST",
      path: "/api/night-mode",
      handler: async ({ request, deps }) => {
        const body = await readObject(request, "night mode payload");
        const mode = body.mode;
        if (mode !== "dark" && mode !== "light" && mode !== "auto") {
          invalid("mode must be dark, light, or auto");
        }
        return Response.json({
          ok: true,
          nightMode: await downstream("set night mode", () =>
            deps.setNightMode(mode)
          ),
        });
      },
    },
    {
      method: "GET",
      path: "/api/font-scale",
      handler: async ({ deps }) => Response.json({
        ok: true,
        fontScale: await downstream("read font scale", deps.getFontScale),
      }),
    },
    {
      method: "POST",
      path: "/api/font-scale",
      handler: async ({ request, deps }) => {
        const body = await readObject(request, "font scale payload");
        const scale = parseInput(() => parseFontScale(body.scale));
        return Response.json({
          ok: true,
          fontScale: await downstream("set font scale", () =>
            deps.setFontScale(scale)
          ),
        });
      },
    },
    {
      method: "GET",
      path: "/api/network",
      handler: async ({ deps }) => Response.json({
        ok: true,
        network: await downstream("read network state", deps.getNetwork),
      }),
    },
    {
      method: "POST",
      path: "/api/network",
      handler: async ({ request, deps }) => {
        const body = await readObject(request, "network payload");
        const enabled = body.enabled;
        if (typeof enabled !== "boolean") {
          invalid("enabled must be a boolean");
        }
        return Response.json({
          ok: true,
          network: await downstream("set network state", () =>
            deps.setNetwork(enabled)
          ),
        });
      },
    },
  ];
}
