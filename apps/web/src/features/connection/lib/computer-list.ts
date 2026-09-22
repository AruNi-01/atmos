'use client';

import { activeComputers } from '@atmos/relay-client';
import type { ComputerRow } from '@/features/connection/lib/connection-ui-prefs';

const APP_DEVICE_ID_PATTERN = /^[a-f0-9]{64}$/;

function normalizeServerId(serverId: string | null | undefined): string | null {
  const trimmed = serverId?.trim();
  return trimmed ? trimmed : null;
}

function normalizeAppDeviceId(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase() ?? '';
  return APP_DEVICE_ID_PATTERN.test(value) ? value : null;
}

export function isCurrentLocalComputer(
  computer: Pick<ComputerRow, 'server_id' | 'app_device_id'>,
  localServerId: string | null | undefined,
  localAppDeviceId?: string | null,
): boolean {
  const normalizedLocalServerId = normalizeServerId(localServerId);
  if (normalizedLocalServerId && computer.server_id === normalizedLocalServerId) {
    return true;
  }
  const localDeviceId = normalizeAppDeviceId(localAppDeviceId);
  const computerDeviceId = normalizeAppDeviceId(computer.app_device_id);
  return Boolean(localDeviceId && computerDeviceId && localDeviceId === computerDeviceId);
}

export function activeComputerRows(computers: ComputerRow[]): ComputerRow[] {
  return activeComputers(computers);
}
