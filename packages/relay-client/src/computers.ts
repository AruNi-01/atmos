import type { ComputerRow } from "./types";

/** Non-revoked computers (settings list / pickers). */
export function activeComputers(computers: ComputerRow[]): ComputerRow[] {
  return computers.filter((c) => !c.revoked);
}

/** Online and not revoked. */
export function onlineComputers(computers: ComputerRow[]): ComputerRow[] {
  return computers.filter((c) => !c.revoked && Boolean(c.online));
}
