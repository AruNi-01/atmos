/**
 * Connection instance — isolates browser UI prefs per Atmos Server target.
 */

export type ConnectionInstanceId = 'local' | `computer:${string}`;

export type ConnectionInstanceMode = 'local' | 'relay';

export interface ConnectionInstance {
  id: ConnectionInstanceId;
  mode: ConnectionInstanceMode;
  serverId: string | null;
}

export const LOCAL_INSTANCE_ID: ConnectionInstanceId = 'local';

export function computerInstanceId(serverId: string): ConnectionInstanceId {
  return `computer:${serverId}`;
}

export function instanceIdFromRelaySelection(
  mode: ConnectionInstanceMode,
  selectedServerId: string | null,
): ConnectionInstanceId {
  if (mode === 'relay' && selectedServerId?.trim()) {
    return computerInstanceId(selectedServerId.trim());
  }
  return LOCAL_INSTANCE_ID;
}

export function parseConnectionInstanceId(raw: string | null | undefined): ConnectionInstanceId {
  const t = (raw ?? '').trim();
  if (!t || t === 'local') {
    return LOCAL_INSTANCE_ID;
  }
  if (t.startsWith('computer:')) {
    const serverId = t.slice('computer:'.length).trim();
    if (serverId) {
      return computerInstanceId(serverId);
    }
  }
  return LOCAL_INSTANCE_ID;
}

export function getServerIdFromInstanceId(id: ConnectionInstanceId): string | null {
  if (id === LOCAL_INSTANCE_ID) {
    return null;
  }
  return id.slice('computer:'.length) || null;
}
