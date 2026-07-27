import {
  serializeIpcError,
  unsupportedCommandError,
  type SerializedIpcError,
} from "../errors.js";
import type { DesktopCommandHandler, DesktopInvokeArgs } from "../types.js";

export type DesktopCommandRouter = {
  listCommands: () => string[];
  invoke: (cmd: string, args?: DesktopInvokeArgs) => Promise<unknown>;
  invokeSafe: (
    cmd: string,
    args?: DesktopInvokeArgs,
  ) => Promise<
    { ok: true; data: unknown } | { ok: false; error: SerializedIpcError }
  >;
};

export function createDesktopCommandRouter(
  handlers: Record<string, DesktopCommandHandler>,
): DesktopCommandRouter {
  const map = handlers;

  return {
    listCommands() {
      return Object.keys(map).sort();
    },

    async invoke(cmd, args) {
      if (typeof cmd !== "string" || !cmd) {
        throw unsupportedCommandError(String(cmd ?? ""));
      }
      const handler = map[cmd];
      if (!handler) {
        throw unsupportedCommandError(cmd);
      }
      return handler(args ?? {});
    },

    async invokeSafe(cmd, args) {
      try {
        const data = await this.invoke(cmd, args);
        return { ok: true, data };
      } catch (error) {
        return { ok: false, error: serializeIpcError(error) };
      }
    },
  };
}
