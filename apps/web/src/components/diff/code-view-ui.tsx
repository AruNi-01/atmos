'use client';

import type { MutableRefObject } from 'react';
import type { CodeViewItem, CodeViewScrollBehavior } from '@pierre/diffs';
import type { CodeViewHandle } from '@pierre/diffs/react';
import { ChevronRight } from 'lucide-react';
import { getFileIconProps } from '@workspace/ui';
import { cn } from '@/lib/utils';
import {
  filePathFromHeaderContext,
  toggleItemCollapsed,
} from '@/components/diff/diff-code-view-shared';

export function createDiffHeaderPrefixRenderer<LAnnotation>(args: {
  viewerRef: MutableRefObject<CodeViewHandle<LAnnotation> | null>;
  pathByFileName: Map<string, string>;
}) {
  return function renderDiffCodeViewHeaderPrefix(
    item: CodeViewItem<LAnnotation>,
  ) {
    if (item.type !== 'diff') return null;
    const fileDiff = item.fileDiff;
    const filePath = filePathFromHeaderContext(fileDiff, args.pathByFileName);
    const collapsed = item.collapsed === true;
    const baseName = filePath.split('/').pop() || filePath;
    const iconProps = getFileIconProps({
      name: baseName,
      isDir: false,
      className: 'size-4 shrink-0',
    });

    const isEmptyDiff =
      fileDiff.splitLineCount === 0 && fileDiff.unifiedLineCount === 0;

    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          disabled={isEmptyDiff}
          aria-expanded={!isEmptyDiff && !collapsed}
          aria-label={
            isEmptyDiff
              ? undefined
              : collapsed
                ? 'Expand diff'
                : 'Collapse diff'
          }
          className={cn(
            'inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors',
            'hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isEmptyDiff) return;
            toggleItemCollapsed(args.viewerRef, item.id);
          }}
        >
          <ChevronRight
            className={cn(
              'size-4 transition-transform',
              !isEmptyDiff && !collapsed && 'rotate-90',
            )}
          />
        </button>
        <img {...iconProps} alt="" />
      </span>
    );
  };
}

export function scrollCodeViewToItem<LAnnotation = undefined>(
  handle: CodeViewHandle<LAnnotation> | null | undefined,
  id: string,
  opts?: { line?: number; behavior?: CodeViewScrollBehavior },
) {
  const behavior = opts?.behavior ?? 'smooth';
  handle?.scrollTo({
    type: 'item',
    id,
    align: 'start',
    behavior,
  });
  if (opts?.line != null && opts.line > 0) {
    handle?.scrollTo({
      type: 'line',
      id,
      lineNumber: opts.line,
      align: 'center',
      behavior,
    });
  }
}

/** File whose diff occupies the viewport center, with a top-of-viewport fallback. */
export function findDiffItemIdForViewport<LAnnotation>(
  viewer: {
    getTopForItem(id: string): number | undefined;
    getWindowSpecs(): { top: number; bottom: number };
  },
  itemIds: readonly string[],
): string | undefined {
  const windowSpecs = viewer.getWindowSpecs();
  const viewportTop = windowSpecs.top;
  const viewportMidpoint = viewportTop + (windowSpecs.bottom - viewportTop) / 2;
  let activeId: string | undefined;
  let activeTop = -Infinity;
  const viewportOffset = 4;

  for (let index = 0; index < itemIds.length; index += 1) {
    const id = itemIds[index];
    const top = viewer.getTopForItem(id);
    if (top == null) continue;
    const nextTop = itemIds[index + 1]
      ? viewer.getTopForItem(itemIds[index + 1])
      : undefined;

    if (viewportMidpoint >= top && (nextTop == null || viewportMidpoint < nextTop)) {
      return id;
    }

    if (top <= viewportTop + viewportOffset && top > activeTop) {
      activeTop = top;
      activeId = id;
    }
  }

  return activeId ?? itemIds[0];
}

export function findDiffItemIdAtScrollTop<LAnnotation>(
  viewer: {
    getTopForItem(id: string): number | undefined;
    getWindowSpecs(): { top: number; bottom: number };
  },
  _scrollTop: number,
  itemIds: readonly string[],
): string | undefined {
  return findDiffItemIdForViewport(viewer, itemIds);
}
