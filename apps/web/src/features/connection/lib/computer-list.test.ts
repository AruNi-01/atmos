import { describe, expect, it } from 'bun:test';

import {
  activeComputerRows,
  isCurrentLocalComputer,
} from './computer-list';
import type { ComputerRow } from './connection-ui-prefs';

function row(serverId: string, revoked = 0): ComputerRow {
  return {
    server_id: serverId,
    display_name: serverId,
    revoked,
    created_at: 1,
    last_seen_at: null,
    registration_meta: null,
    online: false,
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
});
