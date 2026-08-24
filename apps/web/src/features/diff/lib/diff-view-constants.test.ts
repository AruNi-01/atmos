import { describe, expect, test } from 'bun:test';
import { buildSharedDiffViewOptions } from './diff-view-constants';

describe('buildSharedDiffViewOptions', () => {
  test('pins Pierre canvas tokens to Atmos --background', () => {
    const options = buildSharedDiffViewOptions({
      theme: { dark: 'pierre-dark-soft', light: 'pierre-light-soft' },
      themeType: 'dark',
      diffStyle: 'split',
      wordWrap: false,
    });

    expect(options.unsafeCSS).toContain('--diffs-bg: var(--background)');
    expect(options.unsafeCSS).toContain('--diffs-dark-bg: var(--background)');
    expect(options.unsafeCSS).toContain('--diffs-light-bg: var(--background)');
  });
});
