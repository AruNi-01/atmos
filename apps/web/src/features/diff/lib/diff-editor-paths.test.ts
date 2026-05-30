import { describe, expect, test } from 'bun:test';
import type { GitChangedFile } from '@/api/ws-api';
import { getFilesForDiffGroup } from './diff-editor-paths';

function changedFile(path: string, status: string): GitChangedFile {
  return {
    path,
    status,
    additions: 1,
    deletions: 0,
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
});
