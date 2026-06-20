import type { ComputerRow } from "@/api/types";

export function activeSettingsComputers(computers: ComputerRow[]): ComputerRow[] {
  return computers.filter((computer) => !computer.revoked);
}
