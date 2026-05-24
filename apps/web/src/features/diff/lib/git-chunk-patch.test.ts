import { describe, expect, test } from 'bun:test';
import { Text } from '@codemirror/state';
import { Chunk } from '@codemirror/merge';
import { buildUnifiedPatchForChunk, normalizeGitFilePath } from './git-chunk-patch';

describe('git-chunk-patch', () => {
  test('normalizeGitFilePath uses forward slashes', () => {
    expect(normalizeGitFilePath('foo\\bar\\baz')).toBe('foo/bar/baz');
  });

  test('buildUnifiedPatchForChunk produces applyable shape for modify', () => {
    const a = Text.of(['line1', 'line2', 'old', 'line4']);
    const b = Text.of(['line1', 'line2', 'new', 'line4']);
    const chunks = Chunk.build(a, b, { scanLimit: 500, timeout: 200 });
    expect(chunks.length).toBeGreaterThan(0);
    const patch = buildUnifiedPatchForChunk('src/foo.txt', a, b, chunks[0]!, false);
    expect(patch).toContain('diff --git');
    expect(patch).toContain('--- a/src/foo.txt');
    expect(patch).toContain('+new');
    expect(patch).toContain('-old');
  });
});
