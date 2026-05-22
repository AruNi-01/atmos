import type { CodeViewLayout, DiffIndicators, ThemesType } from '@pierre/diffs';

/** Matches diffshub CodeView layout — tight gaps reduce scroll height churn. */
export const CODE_VIEW_LAYOUT: CodeViewLayout = {
  paddingTop: 0,
  gap: 1,
  paddingBottom: 0,
};

/** Host scroll surface — aligned with diffshub `CodeViewWrapper`. */
export const CODE_VIEW_HOST_CLASS =
  'diff-code-view-host cv-scrollbar relative h-full min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain w-full [contain:strict] [overflow-anchor:none] [will-change:scroll-position] [&_diffs-container]:overflow-clip [&_diffs-container]:[contain:layout_paint_style]';

/**
 * Pierre header + hunk separator fixes.
 * Split view: label renders in the deletions gutter (left). The additions pane is an
 * empty bar only — never force the label into additions [data-content] (causes vertical
 * misalignment on the right, as in the split-view screenshot).
 */
export const DIFF_VIEW_SEPARATOR_CSS = `
  [data-diffs-header] [data-change-icon],
  [data-diffs-header] [data-rename-icon] {
    display: none !important;
  }

  [data-separator=line-info] [data-unmodified-lines],
  [data-separator=line-info-basic] [data-unmodified-lines] {
    color: var(--diffs-fg-number);
    overflow: visible;
    text-overflow: unset;
    white-space: nowrap;
  }

  /* Keep unchanged separators visually spanning both split panes. */
  [data-diff-type=split]
    :is([data-deletions] [data-content], [data-additions] [data-content])
    [data-separator=line-info] [data-separator-wrapper],
  [data-diff-type=split]
    :is([data-deletions] [data-content], [data-additions] [data-content])
    [data-separator=line-info-basic] [data-separator-wrapper] {
    display: block !important;
  }

  [data-diff-type=split] :is([data-deletions] [data-content], [data-additions] [data-content])
    :is([data-separator=line-info], [data-separator=line-info-basic])
    [data-separator-content] {
    visibility: hidden !important;
  }

  /* Left/unified: ensure label stays visible in gutter */
  :is([data-deletions] [data-gutter], [data-unified] [data-gutter])
    [data-separator=line-info] [data-separator-wrapper] [data-separator-content],
  [data-unified] [data-separator=line-info] [data-separator-wrapper] [data-separator-content] {
    display: flex !important;
    align-items: center !important;
  }
`;

export const DIFF_VIEW_SCROLLBAR_CSS = `
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.2);
    border-radius: 9999px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(128, 128, 128, 0.4);
  }
  ::-webkit-scrollbar-corner {
    background: transparent;
  }
`;

export const ATMOS_DIFF_THEME: ThemesType = {
  dark: 'pierre-dark-soft',
  light: 'pierre-light-soft',
};

export function buildSharedDiffViewOptions(args: {
  theme: ThemesType;
  diffStyle: 'split' | 'unified';
  wordWrap: boolean;
  disableBackground?: boolean;
  lineNumbers?: boolean;
  diffIndicators?: DiffIndicators;
  enableLineSelection?: boolean;
  enableGutterUtility?: boolean;
}): {
  theme: ThemesType;
  diffStyle: 'split' | 'unified';
  disableBackground: boolean;
  disableLineNumbers: boolean;
  diffIndicators: DiffIndicators;
  overflow: 'wrap' | 'scroll';
  unsafeCSS: string;
  enableLineSelection: boolean;
  enableGutterUtility: boolean;
  stickyHeaders: boolean;
  pointerEventsOnScroll: boolean;
  lineHoverHighlight: 'number';
  layout: CodeViewLayout;
  hunkSeparators: 'line-info';
  expandUnchanged: boolean;
  expansionLineCount: number;
} {
  return {
    layout: CODE_VIEW_LAYOUT,
    theme: args.theme,
    diffStyle: args.diffStyle,
    disableBackground: args.disableBackground ?? false,
    disableLineNumbers: args.lineNumbers === false,
    diffIndicators: args.diffIndicators ?? 'bars',
    overflow: args.wordWrap ? 'wrap' : 'scroll',
    unsafeCSS: `${DIFF_VIEW_SCROLLBAR_CSS}\n${DIFF_VIEW_SEPARATOR_CSS}`,
    enableLineSelection: args.enableLineSelection ?? false,
    enableGutterUtility: args.enableGutterUtility ?? false,
    stickyHeaders: true,
    pointerEventsOnScroll: true,
    lineHoverHighlight: 'number',
    hunkSeparators: 'line-info',
    expandUnchanged: false,
    expansionLineCount: 100,
  };
}
