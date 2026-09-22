import { describe, expect, it } from 'bun:test';

import {
  activeComputerRows,
  isCurrentLocalComputer,
} from './computer-list';
import type { ComputerRow } from './connection-ui-prefs';

const APP_DEVICE_ID = 'ab'.repeat(32);

function row(
  serverId: string,
  revoked = 0,
  extra: Partial<ComputerRow> = {},
): ComputerRow {
  return {
    server_id: serverId,
    display_name: serverId,
    revoked,
    created_at: 1,
    last_seen_at: null,
    registration_meta: null,
    online: false,
    ...extra,
  };
}

describe('computer-list', () => {
  it('filters revoked rows from the active computer list', () => {
    const computers = [row('local'), row('remote'), row('revoked', 1)];

    expect(activeComputerRows(computers).map(computer => computer.server_id)).toEqual([
      'local',
      'remote',
    ]);
  });

  it('identifies the current local computer by server id', () => {
    expect(isCurrentLocalComputer(row('local'), 'local')).toBe(true);
    expect(isCurrentLocalComputer(row('local'), '  ')).toBe(false);
    expect(isCurrentLocalComputer(row('local'), null)).toBe(false);
  });

  it('identifies this machine by app device id after local credentials are gone', () => {
    const registered = row('old', 0, { app_device_id: APP_DEVICE_ID });
    const other = row('air', 0, { app_device_id: 'cd'.repeat(32) });

    expect(isCurrentLocalComputer(registered, null, APP_DEVICE_ID.toUpperCase())).toBe(true);
    expect(isCurrentLocalComputer(other, null, APP_DEVICE_ID)).toBe(false);
    expect(isCurrentLocalComputer(row('legacy'), null, APP_DEVICE_ID)).toBe(false);
  });
});
