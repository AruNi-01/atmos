import type {
  CodeViewLayout,
  DiffIndicators,
  ThemesType,
  ThemeTypes,
} from '@pierre/diffs';

/** Matches diffshub CodeView layout — tight gaps reduce scroll height churn. */
export const CODE_VIEW_LAYOUT: CodeViewLayout = {
  paddingTop: 0,
  gap: 1,
  paddingBottom: 0,
};

/** Host scroll surface — aligned with diffshub `CodeViewWrapper`. */
export const CODE_VIEW_HOST_CLASS =
  'diff-code-view-host cv-scrollbar relative h-full min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain w-full [contain:strict] [overflow-anchor:none] [will-change:scroll-position] [&_diffs-container]:overflow-clip [&_diffs-container]:[contain:layout_paint_style]';

export const ATMOS_DIFF_THEME: ThemesType = {
  dark: 'pierre-dark-soft',
  light: 'pierre-light-soft',
};

const DIFF_VIEW_CUSTOM_FILE_ICON_CSS = `
  [data-change-icon] {
    display: none !important;
  }
`;

export function getAtmosDiffThemeType(resolvedTheme?: string): ThemeTypes {
  if (resolvedTheme === 'dark') return 'dark';
  if (
    resolvedTheme == null &&
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark')
  ) {
    return 'dark';
  }
  return 'light';
}

export function buildSharedDiffViewOptions(args: {
  theme: ThemesType;
  themeType?: ThemeTypes;
  diffStyle: 'split' | 'unified';
  wordWrap: boolean;
  disableBackground?: boolean;
  lineNumbers?: boolean;
  diffIndicators?: DiffIndicators;
  enableLineSelection?: boolean;
  enableGutterUtility?: boolean;
}): {
  theme: ThemesType;
  themeType: ThemeTypes | undefined;
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
    themeType: args.themeType,
    diffStyle: args.diffStyle,
    disableBackground: args.disableBackground ?? false,
    disableLineNumbers: args.lineNumbers === false,
    diffIndicators: args.diffIndicators ?? 'bars',
    overflow: args.wordWrap ? 'wrap' : 'scroll',
    unsafeCSS: DIFF_VIEW_CUSTOM_FILE_ICON_CSS,
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
