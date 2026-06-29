import { describe, expect, test } from 'bun:test';
import type { GitChangedFile } from '@/api/ws-api';
import { getFilesForDiffGroup } from './diff-editor-paths';

function changedFile(path: string, status: string): GitChangedFile {
  return {
    path,
    status,
    additions: 1,
    deletions: 0,
    staged: false,
  };
}

describe('diff-editor-paths', () => {
  test('keeps untracked files visible when compare mode is active', () => {
    const untracked = changedFile('src/new-file.ts', '?');

    expect(
      getFilesForDiffGroup('untracked', {
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [untracked],
        compareFiles: [],
        compareRef: 'origin/main',
      }),
    ).toEqual([untracked]);
  });

  test('uses compare files for branch and commit groups', () => {
    const compared = changedFile('src/changed.ts', 'M');

    expect(
      getFilesForDiffGroup('branch', {
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
        compareFiles: [compared],
        compareRef: 'origin/main',
      }),
    ).toEqual([compared]);

    expect(
      getFilesForDiffGroup('commit', {
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
        compareFiles: [compared],
        compareRef: 'e666885e593fc8e67d17b9a2c325775922f98254',
      }),
    ).toEqual([compared]);
  });

  test('keeps legacy compared groups mapped to compare files', () => {
    const compared = changedFile('src/changed.ts', 'M');

    expect(
      getFilesForDiffGroup('compared', {
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
        compareFiles: [compared],
        compareRef: 'origin/main',
      }),
    ).toEqual([compared]);
  });
});
