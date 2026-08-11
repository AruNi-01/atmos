'use client';

import { activeComputers } from '@atmos/relay-client';
import type { ComputerRow } from '@/features/connection/lib/connection-ui-prefs';

function normalizeServerId(serverId: string | null | undefined): string | null {
  const trimmed = serverId?.trim();
  return trimmed ? trimmed : null;
}

export function isCurrentLocalComputer(
  computer: Pick<ComputerRow, 'server_id'>,
  localServerId: string | null | undefined,
): boolean {
  const normalizedLocalServerId = normalizeServerId(localServerId);
  return Boolean(normalizedLocalServerId && computer.server_id === normalizedLocalServerId);
}

export function activeComputerRows(computers: ComputerRow[]): ComputerRow[] {
  return activeComputers(computers);
}
