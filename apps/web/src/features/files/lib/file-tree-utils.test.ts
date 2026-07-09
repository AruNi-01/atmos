import { describe, expect, test } from 'bun:test';

import {
  buildFallbackFileTreeItem,
  type FileTreeItem,
} from './file-tree-utils';

describe('file-tree-utils', () => {
  test('uses the basename for missing tree item fallback labels', () => {
    const item = buildFallbackFileTreeItem(
      '/Users/lurunrun/.atmos/workspaces/atmos/blastoise/specs/APP/QUALITY-005_typescript-7-upgrade',
    );

    expect(item.name).toBe('QUALITY-005_typescript-7-upgrade');
    expect(item.path).toBe(
      '/Users/lurunrun/.atmos/workspaces/atmos/blastoise/specs/APP/QUALITY-005_typescript-7-upgrade',
    );
    expect(item.isDir).toBe(false);
  });

  test('preserves known item metadata before constructing a fallback', () => {
    const known = new Map<string, FileTreeItem>();
    known.set('/repo/specs/APP', {
      id: '/repo/specs/APP',
      name: 'APP',
      path: '/repo/specs/APP',
      isDir: true,
      isSymlink: false,
      isIgnored: true,
    });

    expect(buildFallbackFileTreeItem('/repo/specs/APP', known)).toEqual(
      known.get('/repo/specs/APP'),
    );
  });

  test('infers a missing item is a directory when known descendants exist', () => {
    const known = new Map<string, FileTreeItem>();
    known.set('/repo/specs/APP/QUALITY-005_typescript-7-upgrade/TECH.md', {
      id: '/repo/specs/APP/QUALITY-005_typescript-7-upgrade/TECH.md',
      name: 'TECH.md',
      path: '/repo/specs/APP/QUALITY-005_typescript-7-upgrade/TECH.md',
      isDir: false,
      isSymlink: false,
      isIgnored: false,
    });

    const item = buildFallbackFileTreeItem(
      '/repo/specs/APP/QUALITY-005_typescript-7-upgrade',
      known,
    );

    expect(item.name).toBe('QUALITY-005_typescript-7-upgrade');
    expect(item.isDir).toBe(true);
  });
});
