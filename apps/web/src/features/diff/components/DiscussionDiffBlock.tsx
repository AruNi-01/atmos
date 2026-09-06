'use client';

/**
 * PR conversation / review-discussion code+diff chrome:
 * language icon + path + optional `line N` on `bg-muted/30`, then Pierre
 * MultiFileDiff with Pierre's own file header disabled.
 *
 * Shared by PR ReviewCommentThreadView and agent Write/Edit tool bodies.
 * Callers that want Agent Fix pass it via `headerTrailing` — omit in agent chat.
 */

import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { ChevronRight } from 'lucide-react';
import { getFileIconProps } from '@workspace/ui';
import {
  DEFAULT_VIRTUAL_FILE_METRICS,
  type FileContents,
} from '@pierre/diffs';
import { MultiFileDiff } from '@pierre/diffs/react';
import {
  ATMOS_DIFF_THEME,
  buildSharedDiffViewOptions,
  getAtmosDiffThemeType,
} from '@/features/diff/lib/diff-view-constants';
import { diffSideCacheKey } from '@/features/diff/lib/diff-code-view-shared';
import { cn } from '@/shared/lib/utils';

/**
 * Flush discussion embeds against Atmos header / container edge.
 *
 * Root cause: with `disableFileHeader`, Pierre does not zero `[data-code]`
 * padding (that only happens when a `[data-diffs-header]` sibling exists).
 * Default `--diffs-gap-fallback: 8px` then paints empty strips above/below
 * the hunk lines. Metrics must match so virtualization bufferAfter stays 0.
 */
const DISCUSSION_DIFF_FLUSH_CSS = `
  [data-file-header],
  [data-diffs-file-header],
  [data-diffs-header] {
    display: none !important;
    height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  diffs-container {
    margin-top: 0 !important;
    margin-bottom: 0 !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }
  /* Real gap source when Pierre file header is disabled. */
  [data-code] {
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }
  [data-diff-type="split"][data-overflow="wrap"],
  [data-dehydrated][data-diff-type="split"][data-overflow="scroll"] {
    padding-block: 0 !important;
  }
`;

/** Match zeroed `[data-code]` padding for virtual height accounting. */
const DISCUSSION_DIFF_METRICS = {
  ...DEFAULT_VIRTUAL_FILE_METRICS,
  paddingTop: 0,
  paddingBottom: 0,
};

function buildFilesFromDiffHunk(
  path: string,
  diffHunk: string,
): { oldFile: FileContents; newFile: FileContents } | null {
  const lines = diffHunk.split('\n');
  const oldLines: string[] = [];
  const newLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith('@@')) continue;
    if (line.startsWith('---') || line.startsWith('+++')) continue;
    if (line.startsWith('-')) {
      oldLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith('+')) {
      newLines.push(line.slice(1));
      continue;
    }
    if (line.startsWith(' ')) {
      const content = line.slice(1);
      oldLines.push(content);
      newLines.push(content);
    }
  }

  if (oldLines.length === 0 && newLines.length === 0) {
    return null;
  }

  const name = path.split('/').pop() || path;
  return {
    oldFile: { name, contents: oldLines.join('\n') },
    newFile: { name, contents: newLines.join('\n') },
  };
}

function buildFilesFromContents(
  path: string,
  oldContent: string,
  newContent: string,
): { oldFile: FileContents; newFile: FileContents } {
  const name = path.split('/').pop() || path;
  return {
    oldFile: {
      name,
      contents: oldContent,
      cacheKey: diffSideCacheKey(path, oldContent),
    },
    newFile: {
      name,
      contents: newContent,
      cacheKey: diffSideCacheKey(path, newContent),
    },
  };
}

function DiscussionMultiFileDiff({
  path,
  oldContent,
  newContent,
  diffHunk,
  patch,
  maxHeightClass,
  fallback,
}: {
  path: string;
  oldContent?: string;
  newContent?: string;
  diffHunk?: string;
  patch?: string;
  maxHeightClass: string;
  fallback?: ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const diffFiles = useMemo(() => {
    if (oldContent != null || newContent != null) {
      return buildFilesFromContents(path, oldContent ?? '', newContent ?? '');
    }
    const hunk = diffHunk ?? patch;
    if (hunk) {
      return buildFilesFromDiffHunk(path, hunk);
    }
    return null;
  }, [diffHunk, newContent, oldContent, patch, path]);

  const options = useMemo(() => {
    const shared = buildSharedDiffViewOptions({
      theme: ATMOS_DIFF_THEME,
      themeType: getAtmosDiffThemeType(resolvedTheme),
      diffStyle: 'unified' as const,
      wordWrap: true,
      lineNumbers: true,
      enableLineSelection: false,
      enableGutterUtility: false,
    });
    return {
      ...shared,
      // PR discussion: Atmos header owns path chrome; hide Pierre file header.
      disableFileHeader: true,
      stickyHeaders: false,
      // Flush first hunk under Atmos header (shared CodeView uses gap: 1).
      layout: {
        ...shared.layout,
        gap: 0,
        paddingTop: 0,
        paddingBottom: 0,
      },
      unsafeCSS: `${shared.unsafeCSS}${DISCUSSION_DIFF_FLUSH_CSS}`,
    };
  }, [resolvedTheme]);

  if (!isMounted || !diffFiles) {
    return (
      <div
        data-discussion-diff-body=""
        className={cn('overflow-auto', maxHeightClass)}
      >
        {fallback ?? (
          <pre className="overflow-x-auto bg-muted/20 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {diffHunk ?? patch ?? ''}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div
      data-discussion-diff-body=""
      className={cn('overflow-auto', maxHeightClass)}
    >
      <MultiFileDiff
        oldFile={{
          ...diffFiles.oldFile,
          cacheKey:
            diffFiles.oldFile.cacheKey ?? `${diffFiles.oldFile.name}:old`,
        }}
        newFile={{
          ...diffFiles.newFile,
          cacheKey:
            diffFiles.newFile.cacheKey ?? `${diffFiles.newFile.name}:new`,
        }}
        options={options}
        metrics={DISCUSSION_DIFF_METRICS}
      />
    </div>
  );
}

export interface DiscussionDiffBlockProps {
  path: string;
  /** Shown in the Atmos header (may be cwd-relative). Defaults to `path`. */
  displayPath?: string;
  /** PR discussion single-line label (`line N`); omit to hide. */
  line?: number | null;
  /** Read-tool style range (`line 1~50`). Prefer over `line` when both set. */
  lineRange?: { start: number; end: number } | null;
  oldContent?: string;
  newContent?: string;
  /** Raw unified hunk body (PR `diff_hunk`), without ---/+++ file headers. */
  diffHunk?: string;
  /** Full patch string (agent tool); ---/+++ headers are ignored when parsing. */
  patch?: string;
  /**
   * Right side of the header (comment count, Agent Fix, etc.).
   * Omit in agent tool transcript so Agent Fix stays off.
   */
  headerTrailing?: ReactNode;
  /** Extra content below the diff when expanded (PR review comments). */
  children?: ReactNode;
  defaultExpanded?: boolean;
  /** When false, body is always visible and the header is not a toggle. */
  collapsible?: boolean;
  maxHeightClass?: string;
  className?: string;
  headerClassName?: string;
  fallback?: ReactNode;
}

export function DiscussionDiffBlock({
  path,
  displayPath: displayPathProp,
  line,
  lineRange,
  oldContent,
  newContent,
  diffHunk,
  patch,
  headerTrailing,
  children,
  defaultExpanded = false,
  collapsible = true,
  maxHeightClass = 'max-h-[180px]',
  className,
  headerClassName,
  fallback,
}: DiscussionDiffBlockProps) {
  const t = useTranslations('diff.discussionDiff');
  const [expanded, setExpanded] = useState(defaultExpanded);
  const displayPath = displayPathProp || path;
  const baseName = displayPath.split(/[\\/]/).pop() || displayPath;
  const iconProps = getFileIconProps({
    name: baseName,
    isDir: false,
    className: 'size-4 shrink-0',
  });
  const showBody = !collapsible || expanded;
  const hasDiff =
    oldContent != null ||
    newContent != null ||
    Boolean(diffHunk?.trim()) ||
    Boolean(patch?.trim());

  const lineMeta = (() => {
    if (lineRange && lineRange.start > 0 && lineRange.end > 0) {
      if (lineRange.start === lineRange.end) {
        return t('line', { line: lineRange.start });
      }
      return t('lineRange', { start: lineRange.start, end: lineRange.end });
    }
    if (line != null && line > 0) {
      return t('line', { line });
    }
    return null;
  })();

  return (
    <div
      data-discussion-diff-block=""
      data-collapsible={collapsible ? 'true' : 'false'}
      className={cn(
        // No outer muted fill — it showed as a strip between header and body.
        'overflow-hidden rounded-lg border border-border/60 shadow-sm',
        className,
      )}
    >
      <div
        data-discussion-diff-header=""
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        className={cn(
          // No bottom margin/gap — body must sit flush under this header.
          'flex w-full items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-2 text-left',
          collapsible && 'cursor-pointer hover:bg-muted/50',
          headerClassName,
        )}
        onClick={collapsible ? () => setExpanded((value) => !value) : undefined}
        onKeyDown={
          collapsible
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setExpanded((value) => !value);
                }
              }
            : undefined
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- file icons from getFileIconProps */}
        <img {...iconProps} alt="" aria-hidden="true" />
        <span className="truncate font-mono text-[12px] text-foreground/80">
          {displayPath}
        </span>
        {lineMeta ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {lineMeta}
          </span>
        ) : null}
        {headerTrailing ? (
          <span className="relative ml-auto flex h-6 shrink-0 items-center justify-end">
            {headerTrailing}
          </span>
        ) : null}
        {collapsible ? (
          <ChevronRight
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform duration-180 ease-[cubic-bezier(0.22,1,0.36,1)]',
              !headerTrailing && 'ml-auto',
              expanded && 'rotate-90',
            )}
          />
        ) : null}
      </div>

      {collapsible ? (
        <AnimatePresence initial={false}>
          {showBody ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              {hasDiff ? (
                <DiscussionMultiFileDiff
                  path={path}
                  oldContent={oldContent}
                  newContent={newContent}
                  diffHunk={diffHunk}
                  patch={patch}
                  maxHeightClass={maxHeightClass}
                  fallback={fallback}
                />
              ) : null}
              {children}
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : (
        <>
          {hasDiff ? (
            <DiscussionMultiFileDiff
              path={path}
              oldContent={oldContent}
              newContent={newContent}
              diffHunk={diffHunk}
              patch={patch}
              maxHeightClass={maxHeightClass}
              fallback={fallback}
            />
          ) : null}
          {children}
        </>
      )}
    </div>
  );
}
