// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, it, expect } from 'bun:test';
import { tryRelativePathUnderRoot } from '@/shared/lib/path-under-root';

describe('tryRelativePathUnderRoot', () => {
  it('rejects prefix collision: /repo must not match /repo2/...', () => {
    expect(tryRelativePathUnderRoot('/repo2/foo', '/repo')).toBeNull();
  });

  it('accepts proper descendants with segment boundary', () => {
    expect(tryRelativePathUnderRoot('/repo/foo', '/repo')).toBe('foo');
    expect(tryRelativePathUnderRoot('/repo/foo/bar', '/repo')).toBe('foo/bar');
  });

  it('returns empty string when file equals root', () => {
    expect(tryRelativePathUnderRoot('/repo', '/repo')).toBe('');
    expect(tryRelativePathUnderRoot('/repo/', '/repo')).toBe('');
  });

  it('handles filesystem root', () => {
    expect(tryRelativePathUnderRoot('/home/x', '/')).toBe('home/x');
    expect(tryRelativePathUnderRoot('/', '/')).toBe('');
  });

  it('returns null for unrelated paths', () => {
    expect(tryRelativePathUnderRoot('/other/x', '/repo')).toBeNull();
    expect(tryRelativePathUnderRoot('relative-only', '/repo')).toBeNull();
  });
});
